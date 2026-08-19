const cron = require("node-cron");
const db = require("../../config/database");
const { notifyUser } = require("../../app/common/utils/notification");

// Run every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  console.log("💳 [Cron] Checking for abandoned payment checkouts...");
  await checkAbandonedPayments();
});

async function checkAbandonedPayments() {
  try {
    // Query payments in 'created' or 'pending' status initiated between 5 and 30 minutes ago
    // that have NOT yet received a 'payment_abandoned' notification.
    const [abandonedOrders] = await db.query(
      `
      SELECT r.client_id AS user_id, r.module, r.amount, r.razorpay_order_id
      FROM razorpay_orders r
      INNER JOIN customer c ON r.client_id = c.user_id
      LEFT JOIN notifications n ON n.reference_type = 'razorpay_order' 
                               AND n.reference_id = r.razorpay_order_id 
                               AND n.type = 'payment_abandoned'
      WHERE r.status IN ('created', 'pending')
        AND r.created_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
        AND r.created_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
        AND n.notification_id IS NULL
        AND c.fcm_token IS NOT NULL
        AND c.fcm_token != ''
      `
    );

    if (abandonedOrders.length === 0) {
      return;
    }

    console.log(`[Cron] Found ${abandonedOrders.length} abandoned checkout payment(s).`);

    for (const order of abandonedOrders) {
      let title = "Checkout incomplete 💳";
      let message = `You left items in checkout. Complete your transaction of Rs. ${order.amount} to proceed!`;
      let actionUrl = "/orders";

      if (order.module === "ecommerce") {
        title = "Payment incomplete 🛍️";
        message = `Your e-commerce order is waiting! Complete your payment of Rs. ${order.amount} now.`;
        actionUrl = "/orders";
      } else if (order.module === "service") {
        title = "Service order pending 💼";
        message = `Finish your service order of Rs. ${order.amount} to let our experts start working.`;
        actionUrl = "/orders";
      } else if (order.module === "bbps") {
        title = "Utility bill payment pending ⚡";
        message = `Your bill payment of Rs. ${order.amount} was not finished. Tap here to complete it.`;
        actionUrl = "/orders";
      }

      notifyUser(
        {
          userId: order.user_id,
          module: order.module,
          type: "payment_abandoned",
          title,
          message,
          icon: "credit-card",
          reference_type: "razorpay_order",
          reference_id: order.razorpay_order_id,
          action_url: actionUrl,
        },
        "checkout payment abandonment"
      );
    }
  } catch (err) {
    console.error("[Cron] Error running checkout abandonment checker:", err);
  }
}

module.exports = { checkAbandonedPayments };
