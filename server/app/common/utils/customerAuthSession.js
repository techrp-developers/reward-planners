const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../../../config/database");

const REFRESH_COOKIE = "rp_customer_refresh";
const ACCESS_EXPIRES = "15m";
const REFRESH_DAYS = 90;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        const key = index < 0 ? part : part.slice(0, index);
        const value = index < 0 ? "" : part.slice(index + 1);
        return [decodeURIComponent(key), decodeURIComponent(value)];
      }),
  );
}

function getRefreshToken(req) {
  return req.body?.refreshToken || parseCookies(req)[REFRESH_COOKIE] || "";
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/v1/auth",
    maxAge: REFRESH_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/v1/auth",
  });
}

function createAccessToken(userId) {
  return jwt.sign({ user_id: userId, type: "access" }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_EXPIRES,
  });
}

async function issueCustomerSession(userId, req, res) {
  const refreshToken = randomToken();
  const familyId = crypto.randomUUID();
  const deviceName = String(req.body?.deviceName || req.body?.device_name || "").slice(0, 255) || null;

  await db.execute(
    `INSERT INTO customer_auth_sessions
      (user_id, token_hash, family_id, device_name, user_agent, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      hashToken(refreshToken),
      familyId,
      deviceName,
      String(req.get("user-agent") || "").slice(0, 255),
      req.ip || null,
      new Date(Date.now() + REFRESH_DAYS * 86400000),
    ],
  );

  setRefreshCookie(res, refreshToken);
  return { accessToken: createAccessToken(userId), refreshToken };
}

async function rotateCustomerSession(req, res) {
  const rawToken = getRefreshToken(req);
  if (!rawToken) return null;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const tokenHash = hashToken(rawToken);
    const [[stored]] = await connection.execute(
      "SELECT * FROM customer_auth_sessions WHERE token_hash = ? FOR UPDATE",
      [tokenHash],
    );

    if (!stored || stored.revoked_at || new Date(stored.expires_at) <= new Date()) {
      if (stored?.family_id) {
        await connection.execute(
          "UPDATE customer_auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE family_id = ?",
          [stored.family_id],
        );
      }
      await connection.commit();
      clearRefreshCookie(res);
      return null;
    }

    const [[user]] = await connection.execute(
      "SELECT user_id FROM customer WHERE user_id = ? AND status = 1 AND is_verified = 1 LIMIT 1",
      [stored.user_id],
    );
    if (!user) {
      await connection.execute(
        "UPDATE customer_auth_sessions SET revoked_at = NOW() WHERE id = ?",
        [stored.id],
      );
      await connection.commit();
      clearRefreshCookie(res);
      return null;
    }

    const nextToken = randomToken();
    const nextHash = hashToken(nextToken);
    await connection.execute(
      `UPDATE customer_auth_sessions
       SET revoked_at = NOW(), replaced_by_hash = ?, last_used_at = NOW()
       WHERE id = ?`,
      [nextHash, stored.id],
    );
    await connection.execute(
      `INSERT INTO customer_auth_sessions
        (user_id, token_hash, family_id, device_name, user_agent, ip_address, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        stored.user_id,
        nextHash,
        stored.family_id,
        stored.device_name,
        String(req.get("user-agent") || "").slice(0, 255),
        req.ip || null,
        new Date(Date.now() + REFRESH_DAYS * 86400000),
      ],
    );
    await connection.commit();

    setRefreshCookie(res, nextToken);
    return {
      accessToken: createAccessToken(stored.user_id),
      refreshToken: nextToken,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function revokeCustomerSession(req, res) {
  const rawToken = getRefreshToken(req);
  if (rawToken) {
    await db.execute(
      "UPDATE customer_auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = ?",
      [hashToken(rawToken)],
    );
  }
  clearRefreshCookie(res);
}

module.exports = {
  issueCustomerSession,
  rotateCustomerSession,
  revokeCustomerSession,
};
