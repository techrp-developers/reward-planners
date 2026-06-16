const jwt = require("jsonwebtoken");
const AuthModel = require("../models/authModel");

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access token required",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await AuthModel.findById(decoded.user_id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (Number(user.status) !== 1) {
      return res.status(403).json({
        success: false,
        message: "Account inactive",
      });
    }

    // if (Number(user.token_version || 0) !== Number(decoded.token_version || 0)) {
    //   return res.status(401).json({
    //     success: false,
    //     message: "Invalid token",
    //   });
    // }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = auth;
