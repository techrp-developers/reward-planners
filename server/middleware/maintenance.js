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

    // Make app status available to drainMode middleware
    req.appStatus = settings;

    // ==========================================
    // Routes that should always work
    // ==========================================
    const exemptRoutes = [
      "/payment/webhook",
      "/api-docs",
      "/mps",

      // App status
      "/v1/global/app-status",

      // Auth
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
    // Payment completion/recovery routes
    // Allow even during maintenance
    // ==========================================
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
    // Maintenance Mode
    // ==========================================
    if (settings.maintenance_mode) {
      return res.status(503).json({
        success: false,
        maintenance: true,
        message: "Application is under maintenance.",
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};