const db = require("../config/database");

module.exports = async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT maintenance_mode,
              drain_mode,
              maintenance_start_at
       FROM app_settings
       LIMIT 1`
    );

    const settings = rows[0];

    req.appStatus = settings;

    // Routes that should always work
    const exemptRoutes = [
      "/payment/webhook",
      "/api-docs",
      "/admin"
    ];

    const isExempt = exemptRoutes.some(route =>
      req.originalUrl.startsWith(route)
    );

    if (isExempt) {
      return next();
    }

    // Maintenance Mode
    if (settings.maintenance_mode) {
      return res.status(503).json({
        success: false,
        maintenance: true,
        message: "Application is under maintenance."
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};