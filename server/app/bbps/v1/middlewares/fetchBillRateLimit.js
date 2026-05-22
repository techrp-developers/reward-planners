const { getClientIP } = require("../utils/network");

const windowMs = Number(process.env.BBPS_FETCH_BILL_RATE_WINDOW_MS || 60 * 1000);
const maxRequests = Number(process.env.BBPS_FETCH_BILL_RATE_MAX || 15);

const requestStore = new Map();

const fetchBillRateLimit = (req, res, next) => {
  const key = req.user?._id?.toString() || getClientIP(req);
  const now = Date.now();

  const item = requestStore.get(key) || { count: 0, windowStart: now };

  if (now - item.windowStart >= windowMs) {
    item.count = 0;
    item.windowStart = now;
  }

  item.count += 1;
  requestStore.set(key, item);

  if (item.count > maxRequests) {
    return res.status(429).json({
      success: false,
      message: "Too many fetch bill requests. Please try again shortly.",
    });
  }

  return next();
};

module.exports = fetchBillRateLimit;
