const jwt = require("jsonwebtoken");
const AuthModel = require("../models/authModel");

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await AuthModel.findById(decoded.user_id);

    if (!user) {
      return next();
    }

    if (Number(user.status) !== 1) {
      return next();
    }

    // if (Number(user.token_version || 0) !== Number(decoded.token_version || 0)) {
    //   return next();
    // }

    req.user = user;
    next();
  } catch {
    next();
  }
};

module.exports = optionalAuth;
