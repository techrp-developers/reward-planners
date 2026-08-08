const cron = require("node-cron");
const db = require("../../config/database");
const { notifyUser } = require("../push/nonBlockingPush");

// Run every hour
cron.schedule("0 * * * *", async () => {
  console.log("💼 [Cron] Checking for services cart abandonment and missing documents...");
  await checkServiceCartAbandonment();
  await checkMissingDocuments();
});

// 1. Service Cart Abandonment: items in service_cart_items > 2 hours with no checkout
async function checkServiceCartAbandonment() {
  try {
    const [abandonedServiceCarts] = await db.query(
      `
      SELECT DISTINCT sc.user_id, s.name AS service_name, c.fcm_token
      FROM service_cart_items sci
      JOIN service_carts sc ON sci.cart_id = sc.id
      JOIN services s ON sci.service_id = s.id
      INNER JOIN customer c ON sc.user_id = c.user_id
      LEFT JOIN notifications n ON n.user_id = sc.user_id 
                               AND n.type = 'service_cart_abandon'
                               AND n.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      WHERE sci.created_at <= DATE_SUB(NOW(), INTERVAL 2 HOUR)
        AND sci.bundle_id IS NULL
        AND n.notification_id IS NULL
        AND c.fcm_token IS NOT NULL
        AND c.fcm_token != ''
      `
    );

    for (const item of abandonedServiceCarts) {
      notifyUser({
        userId: item.user_id,
        module: "service",
        type: "service_cart_abandon",
        title: "Complete your service request! 💼",
        message: "You have service items left in your cart. Let our experts assist you today!",
        icon: "briefcase",
        reference_type: "service_cart",
        reference_id: "service_cart_abandon",
        action_url: "/cart",
      }, "service cart abandonment notification");
    }
  } catch (err) {
    console.error("[Cron] Service cart abandonment check failed:", err.message);
  }
}

// 2. Missing Documents: service order in documents_pending for > 24 hours
async function checkMissingDocuments() {
  try {
    const [missingDocs] = await db.query(
      `
      SELECT DISTINCT o.user_id, s.name AS service_name, o.id AS order_id, c.fcm_token
      FROM service_orders o
      JOIN services s ON o.service_id = s.id
      INNER JOIN customer c ON o.user_id = c.user_id
      LEFT JOIN notifications n ON n.user_id = o.user_id 
                               AND n.type = 'service_missing_docs'
                               AND n.reference_id = CAST(o.id AS CHAR)
                               AND n.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      WHERE o.status = 'documents_pending'
        AND o.created_at <= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        AND n.notification_id IS NULL
        AND c.fcm_token IS NOT NULL
        AND c.fcm_token != ''
      `
    );

    for (const order of missingDocs) {
      notifyUser({
        userId: order.user_id,
        module: "service",
        type: "service_missing_docs",
        title: "Urgent: Upload Documents 📄",
        message: `We need your documents to begin work on ${order.service_name}. Tap to upload now.`,
        icon: "file-text",
        reference_type: "service_order",
        reference_id: String(order.order_id),
        action_url: `/orders/order-details/${order.order_id}`,
      }, "service missing documents reminder");
    }
  } catch (err) {
    console.error("[Cron] Service missing documents check failed:", err.message);
  }
}

module.exports = { checkServiceCartAbandonment, checkMissingDocuments };
