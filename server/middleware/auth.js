// middleware/auth.js
const { verifyToken } = require('../utils/jwt');

exports.authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authorization header missing"
    });
  }

  try {
    const decoded = verifyToken(token);
    
    // Ensure vendor_id is properly set (can be null for non-vendors)
    req.user = {
      user_id: decoded.user_id,
      vendor_id: decoded.vendor_id || null, // Handle missing vendor_id
      email: decoded.email,
      role: decoded.role
    };
    
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token"
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