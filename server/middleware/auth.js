// middleware/auth.js
const { verifyToken } = require("../utils/jwt");
const db = require("../config/database");

exports.authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authorization header missing",
    });
  }

  try {
    const decoded = verifyToken(token);

    const [[user]] = await db.execute(
      `SELECT user_id, email, role, is_verified
       FROM eusers
       WHERE user_id = ?
       LIMIT 1`,
      [decoded.user_id],
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (Number(user.is_verified) !== 1) {
      return res.status(403).json({
        success: false,
        message: "Account not verified",
      });
    }

    let vendorId = null;
    if (user.role === "vendor") {
      const [[vendor]] = await db.execute(
        `SELECT vendor_id
         FROM vendors
         WHERE user_id = ?
         ORDER BY vendor_id DESC
         LIMIT 1`,
        [user.user_id],
      );
      vendorId = vendor?.vendor_id || null;
    }

    req.user = {
      user_id: user.user_id,
      vendor_id: vendorId,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (err) {
    console.error("Token verification error:", err);
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

exports.authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions"
      });
    }

    next();
  };
};