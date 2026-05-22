const jwt = require("jsonwebtoken");

const authenticateClient = (req, res, next) => {
  try {
    const authHeader =
      req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization header missing",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token missing",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.MPS_ACCESS_TOKEN_SECRET
    );

    if (decoded.type !== "client") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type",
      });
    }

    req.client = decoded;

    next();

  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = authenticateClient;