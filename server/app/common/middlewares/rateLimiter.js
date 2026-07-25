const rateLimit = require("express-rate-limit");

// ==========================
// ipKeyGenerator handles IPv4 + IPv6 correctly
// Required by express-rate-limit v7+
// ==========================
const { ipKeyGenerator } = require("express-rate-limit");

// ==========================
// SHARED KEY GENERATOR
// Keys by user ID if authenticated (more accurate),
// falls back to IP using the safe helper for unauthenticated requests
// ==========================
const makeKeyGenerator = () => (req) => {
  if (req.user?.user_id) {
    return `user_${req.user.user_id}`;
  }
  return ipKeyGenerator(req.ip); // IPv6-safe fallback
};

// ==========================
// PAYMENT — strictest
// 10 attempts per 10 min
// ==========================
const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: makeKeyGenerator(),
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
// 20 per 10 min
// ==========================
const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: makeKeyGenerator(),
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: "Too many requests. Please slow down.",
    });
  },
});

// ==========================
// AUTH / OTP
// 15 attempts per 5 min
// ==========================
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: makeKeyGenerator(),
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: "Too many authentication attempts. Please wait and try again.",
    });
  },
});

// ==========================
// GENERAL API — loose
// 100 per 15 min
// ==========================
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: makeKeyGenerator(),
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: "Too many requests. Please try again later.",
    });
  },
});

const providerReadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: makeKeyGenerator(),
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: "Too many provider requests. Please try again shortly.",
    }),
});

// ==========================
// STEP SYNC
// 60 syncs per 10 min
// ==========================
const stepSyncLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: makeKeyGenerator(),
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: "Too many step sync attempts. Please wait and try again.",
    });
  },
});

module.exports = {
  paymentLimiter,
  checkoutLimiter,
  authLimiter,
  generalLimiter,
  providerReadLimiter,
  stepSyncLimiter,
};
