const jwt = require("jsonwebtoken");

const JWT_SECRET =
  process.env.JWT_SECRET || "REWARD_PLANNERS_SECRET_2025_CHANGE_THIS";

exports.generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "24h",
  });
};

exports.verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};
