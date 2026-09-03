const jwt = require("jsonwebtoken");

const db = require("../../../config/database");
const { verifyToken } = require("../../../utils/jwt");
const {
  ACCESS_COOKIE,
  parseCookies,
  isCsrfValid,
} = require("../../../utils/authSession");

const getRequestTokens = (req) => {
  const authHeader = String(req.headers.authorization || "").trim();
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const cookieToken = parseCookies(req)[ACCESS_COOKIE] || null;

  return [
    bearerToken
      ? {
          token: bearerToken,
          source: "bearer",
        }
      : null,
    cookieToken
      ? {
          token: cookieToken,
          source: "cookie",
        }
      : null,
  ].filter(Boolean);
};

const tryCustomerAuth = async (token) => {
  if (!process.env.ACCESS_TOKEN_SECRET) return null;

  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  if (!decoded?.user_id) {
    const error = new Error("Invalid customer access token payload");
    error.name = "JsonWebTokenError";
    throw error;
  }

  const [[user]] = await db.execute(
    `SELECT
       user_id,
       name,
       email,
       phone,
       status,
       is_verified
     FROM customer
     WHERE user_id = ?
     LIMIT 1`,
    [decoded.user_id],
  );

  if (!user) {
    return {
      ok: false,
      status: 401,
      body: {
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found",
      },
    };
  }

  if (Number(user.status) !== 1) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        code: "ACCOUNT_INACTIVE",
        message: "Account inactive",
      },
    };
  }

  return {
    ok: true,
    user: {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: "customer",
      auth_source: "customer",
    },
  };
};

const tryCrmAuth = async (token) => {
  const decoded = verifyToken(token);
  if (!decoded?.user_id) {
    const error = new Error("Invalid CRM access token payload");
    error.name = "JsonWebTokenError";
    throw error;
  }

  const [[user]] = await db.execute(
    `SELECT
       user_id,
       name,
       email,
       role,
       phone,
       is_verified
     FROM eusers
     WHERE user_id = ?
     LIMIT 1`,
    [decoded.user_id],
  );

  if (!user) {
    return {
      ok: false,
      status: 401,
      body: {
        success: false,
        code: "USER_NOT_FOUND",
        message: "User not found",
      },
    };
  }

  if (Number(user.is_verified) !== 1) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        code: "ACCOUNT_NOT_VERIFIED",
        message: "Account not verified",
      },
    };
  }

  return {
    ok: true,
    user: {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      auth_source: "crm",
    },
  };
};

module.exports = async (req, res, next) => {
  const tokenCandidates = getRequestTokens(req);

  if (!tokenCandidates.length) {
    return res.status(401).json({
      success: false,
      code: "ACCESS_TOKEN_REQUIRED",
      message: "Access token required",
    });
  }

  const attempts = [];

  for (const candidate of tokenCandidates) {
    const { token, source } = candidate;

    if (
      source === "cookie" &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !isCsrfValid(req)
    ) {
      attempts.push({
        ok: false,
        status: 403,
        body: {
          success: false,
          code: "CSRF_INVALID",
          message: "Invalid security token",
        },
      });
      continue;
    }

    try {
      const customerResult = await tryCustomerAuth(token);
      if (customerResult?.ok) {
        req.user = customerResult.user;
        return next();
      }
      if (customerResult) attempts.push(customerResult);
    } catch (error) {
      if (error?.name === "TokenExpiredError") {
        attempts.push({
          ok: false,
          status: 401,
          body: {
            success: false,
            code: "ACCESS_TOKEN_EXPIRED",
            message: "Access token expired",
          },
        });
      }
    }

    try {
      const crmResult = await tryCrmAuth(token);
      if (crmResult?.ok) {
        req.user = crmResult.user;
        return next();
      }
      if (crmResult) attempts.push(crmResult);
    } catch (error) {
      if (error?.name === "TokenExpiredError") {
        attempts.push({
          ok: false,
          status: 401,
          body: {
            success: false,
            code: "ACCESS_TOKEN_EXPIRED",
            message: "Access token expired",
          },
        });
      }
    }
  }

  const preferredFailure =
    attempts.find((entry) => entry.body?.code === "CSRF_INVALID") ||
    attempts.find((entry) => entry.body?.code === "ACCESS_TOKEN_EXPIRED") ||
    attempts.find((entry) => !entry.ok);
  if (preferredFailure) {
    return res.status(preferredFailure.status).json(preferredFailure.body);
  }

  return res.status(401).json({
    success: false,
    code: "ACCESS_TOKEN_INVALID",
    message: "Invalid access token",
  });
};
