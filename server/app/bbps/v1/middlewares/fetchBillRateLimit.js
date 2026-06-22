const db = require("../../../../config/database");
const { getClientIP } = require("../utils/network");

const configuredWindowMs = Number(
  process.env.BBPS_FETCH_BILL_RATE_WINDOW_MS || 60000,
);
const configuredMaxRequests = Number(
  process.env.BBPS_FETCH_BILL_RATE_MAX || 15,
);
const windowMs =
  Number.isFinite(configuredWindowMs) && configuredWindowMs > 0
    ? configuredWindowMs
    : 60000;
const maxRequests =
  Number.isInteger(configuredMaxRequests) && configuredMaxRequests > 0
    ? configuredMaxRequests
    : 15;

const fetchBillRateLimit = async (req, res, next) => {
  const identity = req.user?.user_id
    ? `user_${req.user.user_id}`
    : `ip_${getClientIP(req)}`;
  const windowId = Math.floor(Date.now() / windowMs);
  const rateKey = `fetch_bill:${identity}:${windowId}`;

  try {
    await db.execute(
      `INSERT INTO bbps_rate_limits
       (rate_key, window_started_at, request_count)
       VALUES (?, NOW(), 1)
       ON DUPLICATE KEY UPDATE request_count = request_count + 1`,
      [rateKey],
    );

    const [[rate]] = await db.execute(
      `SELECT request_count FROM bbps_rate_limits WHERE rate_key = ?`,
      [rateKey],
    );

    if (Math.random() < 0.01) {
      db.execute(
        `DELETE FROM bbps_rate_limits WHERE updated_at < NOW() - INTERVAL 1 DAY`,
      ).catch(() => {});
    }

    if (Number(rate?.request_count || 0) > maxRequests) {
      return res.status(429).json({
        success: false,
        message: "Too many fetch bill requests. Please try again shortly.",
      });
    }

    return next();
  } catch (error) {
    console.error("[BBPS][rate-limit] error", error.message);
    return res.status(503).json({
      success: false,
      message: "Unable to validate request rate. Please try again.",
    });
  }
};

module.exports = fetchBillRateLimit;
