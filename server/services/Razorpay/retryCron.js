const cron = require("node-cron");
const db = require("../../config/database");
const ServiceOrderModel = require("../../app/service/v1/models/serviceOrderModel");

async function retryFailedRefunds() {
  const [rows] = await db.execute(
    `SELECT r.service_order_id, r.refund_amount, so.payment_id
     FROM service_order_refunds r
     JOIN service_orders so ON so.id = r.service_order_id
     WHERE r.status IN ('failed', 'pending')
     AND r.retry_count < 5
     AND r.created_at < NOW() - INTERVAL 5 MINUTE
     LIMIT 10`,
  );

  for (const row of rows) {
    // bump retry count before attempting so a crash doesn't leave it as pending forever
    await db.execute(
      `UPDATE service_order_refunds
       SET retry_count = retry_count + 1,
           last_retried_at = NOW()
       WHERE service_order_id = ?`,
      [row.service_order_id],
    );

    await ServiceOrderModel.processRefund({
      payment_id: row.payment_id,
      amount: row.refund_amount,
      service_order_id: row.service_order_id,
    });
  }
}

cron.schedule("*/10 * * * *", retryFailedRefunds);
