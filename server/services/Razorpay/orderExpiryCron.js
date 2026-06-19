const cron = require("node-cron");
const db = require("../../config/database");
const Razorpay = require("razorpay");
const { cronPing, checkCronHealth } = require("../../services/cronMonitor");
const { expirePendingOrder } = require("./orderExpiryService");

const razorpay = new Razorpay({
  key_id: process.env.RAZOR_API_KEY,
  key_secret: process.env.RAZOR_SECRET_KEY,
});

async function cancelExpiredOrders() {
  // Find all expired unpaid orders
  const [orders] = await db.query(
    `SELECT o.order_id, op.razorpay_order_id
     FROM eorders o
     LEFT JOIN order_payments op
       ON o.order_id = op.order_id
       AND op.status IN ('created', 'pending')
     WHERE o.status = 'pending_payment'
       AND o.expires_at IS NOT NULL
       AND o.expires_at < NOW()`,
  );

  if (!orders.length) return;

  for (const order of orders) {
    const orderId = order.order_id;
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const expired = await expirePendingOrder(conn, orderId);

      await conn.commit();

      if (expired) {
        console.log(
          `[ORDER_EXPIRY] Order ${orderId} cancelled and stock restored`,
        );
      }
    } catch (err) {
      await conn.rollback();
      console.error(`[ORDER_EXPIRY] Failed to process order ${orderId}`, err);
    } finally {
      conn.release();
    }
  }
}

// Run Every 5 mins
cron.schedule("*/5 * * * *", async () => {
  try {
    console.log("[ORDER_EXPIRY] Running...");
    await cancelExpiredOrders();
    await cronPing("order_expiry_cron");
  } catch (err) {
    console.error("Expired order cron error", err);
  }
});
