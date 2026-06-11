const rateLimit = require("express-rate-limit");

// ==========================
// PAYMENT — strictest
// 10 attempts per 15 min per IP
// ==========================
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Key by user ID if authenticated, else IP
    return req.user?.user_id ? `user_${req.user.user_id}` : req.ip;
  },
  handler: (req, res) => {
    console.warn("[RATE_LIMIT] Payment limit hit", {
      user_id: req.user?.user_id,
      ip: req.ip,
    });
    return res.status(429).json({
      success: false,
      message: "Too many payment attempts. Please wait and try again.",
    });
  },
});

// ==========================
// CHECKOUT — moderate
// 20 per 15 min per user
// ==========================
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `user_${req.user?.user_id || req.ip}`,
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: "Too many requests. Please slow down.",
    });
  },
});

// ==========================
// GENERAL API — loose
// 100 per 15 min per user
// ==========================
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => `user_${req.user?.user_id || req.ip}`,
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: "Too many requests. Please try again later.",
    });
  },
});

module.exports = { paymentLimiter, checkoutLimiter, generalLimiter };
