const cron = require("node-cron");
const db = require("../../config/database");
const ServiceOrderModel = require("../../app/service/v1/models/serviceOrderModel");
const { cronPing, checkCronHealth } = require("../../services/cronMonitor");
const {
  retryPendingRefunds: retryEcommerceRefunds,
} = require("./ecommerceRefundService");

async function retryFailedRefunds() {
  console.log("💰 [retryFailedRefunds] Running...");
  try {
    const [rows] = await db.execute(
      `SELECT r.id, r.service_order_id, r.refund_amount, so.payment_id
       FROM service_order_refunds r
       JOIN service_orders so ON so.id = r.service_order_id
       WHERE r.status IN ('failed', 'pending')
       AND r.refund_method = 'original'
       AND r.retry_count < 5
       AND r.created_at < NOW() - INTERVAL 5 MINUTE
       AND (r.last_retried_at IS NULL OR r.last_retried_at < NOW() - INTERVAL 10 MINUTE)
       LIMIT 10`,
    );

    for (const row of rows) {
      try {
        await db.execute(
          `UPDATE service_order_refunds
           SET retry_count = retry_count + 1,
               last_retried_at = NOW()
           WHERE id = ?`,
          [row.id],
        );

        await ServiceOrderModel.processRefund({
          payment_id: row.payment_id,
          amount: row.refund_amount,
          service_order_id: row.service_order_id,
        });
      } catch (err) {
        // log and continue to next row
        console.error(
          `[retryFailedRefunds] Failed for service_order_id=${row.service_order_id}:`,
          err.message,
        );
      }
    }
  } catch (err) {
    console.error("[retryFailedRefunds] Cron error:", err.message);
  }
}

async function retryMpsFailedRefunds() {
  console.log("💰 [retryMpsFailedRefunds] Running...");
  try {
    const [rows] = await db.execute(
      `SELECT r.service_order_id, r.refund_amount, so.payment_id
       FROM external_service_order_refunds r
       JOIN external_service_orders so ON so.id = r.service_order_id
       WHERE r.status IN ('failed', 'pending')
       AND r.retry_count < 5
       AND r.created_at < NOW() - INTERVAL 5 MINUTE
       LIMIT 10`,
    );

    for (const row of rows) {
      try {
        await db.execute(
          `UPDATE external_service_order_refunds
           SET retry_count = retry_count + 1,
               last_retried_at = NOW()
           WHERE service_order_id = ?`,
          [row.service_order_id],
        );

        await ServiceOrderModel.processMpsRefund({
          payment_id: row.payment_id,
          amount: row.refund_amount,
          service_order_id: row.service_order_id,
        });
      } catch (err) {
        // log and continue to next row
        console.error(
          `[retryFailedRefunds] Failed for service_order_id=${row.service_order_id}:`,
          err.message,
        );
      }
    }
  } catch (err) {
    console.error("[retryFailedRefunds] Cron error:", err.message);
  }
}

cron.schedule("*/10 * * * *", async function () {
  await Promise.allSettled([
    retryFailedRefunds(),
    retryMpsFailedRefunds(),
    retryEcommerceRefunds(),
  ]);
  await cronPing("service_order_retry_cron");
});
