const jwt = require("jsonwebtoken");
const AuthModel = require("../../../common/models/authModel");

const bbpsAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Missing or invalid Authorization header",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    AuthModel.findById(decoded.user_id)
      .then((user) => {
        // if (
        //   !user ||
        //   Number(user.token_version || 0) !== Number(decoded.token_version || 0)
        // )
        if (!user) {
          return res.status(401).json({
            success: false,
            message: "Invalid token",
          });
        }

        if (Number(user.status) !== 1) {
          return res.status(403).json({
            success: false,
            message: "User account is inactive",
          });
        }

        req.user = user;
        return next();
      })
      .catch(() => {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      });
  } catch (error) {
    const message =
      error.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    return res.status(401).json({
      success: false,
      message,
    });
  }
};

module.exports = bbpsAuth;
