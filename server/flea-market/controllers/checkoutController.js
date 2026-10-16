const checkoutService = require("../services/checkoutService");

class CheckoutController {
  async checkout(req, res) {
    try {
      const idempotencyKey = req.header("Idempotency-Key");
      if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) {
        return res.status(400).json({ success: false, message: "Idempotency-Key header is required" });
      }

      // requireFleaMarketSession runs before this handler and guarantees this is set.
      const session = req.fleaMarketSession;
      const { items, scheduleId, payment } = req.body;

      const result = await checkoutService.checkout(session, idempotencyKey, items, {scheduleId,payment,managerId:req.user.user_id});
      return res.json({ success: true, data: result });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) console.error("[flea-market][checkout] error:", error);
      return res.status(statusCode).json({
        success: false,
        message: statusCode >= 500 ? "Checkout failed" : error.message,
        ...(error.extra || {}),
      });
    }
  }
}

module.exports = new CheckoutController();
