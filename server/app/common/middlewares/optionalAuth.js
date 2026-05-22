const jwt = require("jsonwebtoken");
const AuthModel = require("../models/authModel");

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return next(); 
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const user = await AuthModel.findById(decoded.user_id);

    if (!user || user.token_version !== decoded.token_version) {
      return next(); 
    }

    if (Number(user.status) !== 1) {
      return next(); 
    }

    req.user = user;
    next();

  } catch {
    next();
  }
};

module.exports = optionalAuth;
