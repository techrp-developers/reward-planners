const jwt = require("jsonwebtoken");

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from environment configuration");
  }

  return process.env.JWT_SECRET;
};

exports.generateToken = (payload) => {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "15m",
    algorithm: "HS256",
  });
};

exports.verifyToken = (token) => {
  return jwt.verify(token, getJwtSecret());
};
