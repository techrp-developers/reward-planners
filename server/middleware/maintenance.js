const db = require("../config/database");

module.exports = async (req, res, next) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        maintenance_mode,
        drain_mode,
        maintenance_start_at
      FROM app_settings
      LIMIT 1
    `);

    const settings = rows[0] || {
      maintenance_mode: 0,
      drain_mode: 0,
      maintenance_start_at: null,
    };

    // Make available to drainMode middleware
    req.appStatus = settings;

    // ==========================================
    // Dashboard/Admin Routes
    // ==========================================
    if (
      !req.originalUrl.startsWith("/v1") &&
      !req.originalUrl.startsWith("/mps")
    ) {
      return next();
    }

    // ==========================================
    // Always Allowed Routes
    // ==========================================
    const exemptRoutes = [
      "/payment/webhook",
      "/api-docs",
      "/mps",

      // Mobile App Status
      "/v1/global/app-status",

      // Authentication
      "/v1/auth/login",
      "/v1/auth/refresh",
      "/v1/auth/forgot-password",
      "/v1/auth/verify-forgot-password-otp",
      "/v1/auth/reset-password",
    ];

    const isExempt = exemptRoutes.some((route) =>
      req.originalUrl.startsWith(route),
    );

    if (isExempt) {
      return next();
    }

    // ==========================================
    // Payment Completion Routes
    // ==========================================
    // Allow existing transactions to complete
    const paymentRouteKeywords = [
      "/verify-payment",
      "/payment-status",
      "/retry",
      "/check-status",
    ];

    const isPaymentRoute = paymentRouteKeywords.some((keyword) =>
      req.originalUrl.includes(keyword),
    );

    if (isPaymentRoute) {
      return next();
    }

    // ==========================================
    // Maintenance Mode Check
    // ==========================================
    if (settings.maintenance_mode) {
      return res.status(503).json({
        success: false,
        maintenance: true,
        message: "Application is currently under maintenance.",
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};