const Razorpay = require("razorpay");
const axios = require("axios");
const db = require("../../config/database");
const { notifyUser } = require("../../app/common/utils/notification");
const { makeRefundKey } = require("./refundKey");

function getRazorpay() {
  return new Razorpay({
    key_id: process.env.RAZOR_API_KEY,
    key_secret: process.env.RAZOR_SECRET_KEY,
  });
}

async function updatePaymentRefundStatus(conn, paymentId) {
  const [[payment]] = await conn.query(
    `SELECT amount FROM order_payments WHERE payment_id = ?`,
    [paymentId],
  );
  if (!payment) return;

  const [[totals]] = await conn.query(
    `SELECT COALESCE(SUM(refund_amount), 0) AS refunded
     FROM order_refunds
     WHERE payment_id = ? AND status = 'completed'`,
    [paymentId],
  );

  const refunded = Number(totals.refunded || 0);
  const status =
    refunded >= Number(payment.amount) ? "refunded" : "partially_refunded";

  await conn.query(
    `UPDATE order_payments SET status = ? WHERE payment_id = ?`,
    [status, paymentId],
  );
}

async function completeRefund(refundId, gatewayRefund) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      `SELECT payment_id, order_id, order_item_id, shipment_id,
              refund_amount, refund_key
       FROM order_refunds WHERE refund_id = ? FOR UPDATE`,
      [refundId],
    );
    if (!row) {
      await conn.rollback();
      return;
    }

    await conn.query(
      `UPDATE order_refunds
       SET status = 'completed', razorpay_refund_id = ?, completed_at = NOW(),
           last_error = NULL
       WHERE refund_id = ?`,
      [gatewayRefund.id, refundId],
    );
    await updatePaymentRefundStatus(conn, row.payment_id);
    if (!row.shipment_id && row.refund_key?.includes("cancel_refund")) {
      await conn.query(
        `INSERT INTO order_cancellation_timeline (order_id, event)
         SELECT ?, 'refund_completed'
         WHERE NOT EXISTS (
           SELECT 1 FROM order_cancellation_timeline
           WHERE order_id = ? AND event = 'refund_completed'
         )`,
        [row.order_id, row.order_id],
      );
    }
    if (row.order_item_id) {
      await conn.query(
        `UPDATE ecommerce_item_cancellations
         SET refund_status = 'completed'
         WHERE order_item_id = ?`,
        [row.order_item_id],
      );
      await conn.query(
        `INSERT INTO ecommerce_item_cancellation_timeline
          (order_item_id, event)
         SELECT ?, 'refund_completed'
         WHERE NOT EXISTS (
           SELECT 1 FROM ecommerce_item_cancellation_timeline
           WHERE order_item_id = ? AND event = 'refund_completed'
         )`,
        [row.order_item_id, row.order_item_id],
      );
    }
    await conn.commit();

    const [[order]] = await db.query(
      `SELECT user_id FROM eorders WHERE order_id = ?`,
      [row.order_id],
    );
    if (order?.user_id) {
      notifyUser(
        {
          userId: order.user_id,
          module: "ecommerce",
          type: "refund_completed",
          title: "Refund completed",
          message: `A refund of Rs. ${Number(row.refund_amount).toFixed(2)} has been processed.`,
          icon: "refresh-cw",
          reference_type: "refund",
          reference_id: refundId,
          action_url: `/orders/order-details/${row.order_id}`,
        },
        "ecommerce refund completed",
      );
    }
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function processRefund({
  orderId,
  orderItemId = null,
  shipmentId = null,
  vendorOrderId = null,
  amount,
  paymentId = null,
  razorpayPaymentId = null,
  refundKey = null,
}) {
  const key = makeRefundKey({ orderId, shipmentId, paymentId, refundKey });
  const conn = await db.getConnection();
  let refundId;
  let payment;

  try {
    await conn.beginTransaction();

    if (paymentId) {
      [[payment]] = await conn.query(
        `SELECT payment_id, razorpay_payment_id, amount, status
         FROM order_payments WHERE payment_id = ? FOR UPDATE`,
        [paymentId],
      );
    } else if (razorpayPaymentId) {
      [[payment]] = await conn.query(
        `SELECT payment_id, razorpay_payment_id, amount, status
         FROM order_payments WHERE razorpay_payment_id = ? FOR UPDATE`,
        [razorpayPaymentId],
      );
    } else {
      [[payment]] = await conn.query(
        `SELECT payment_id, razorpay_payment_id, amount, status
         FROM order_payments
         WHERE order_id = ?
           AND status IN ('success', 'partially_refunded')
         ORDER BY payment_id DESC LIMIT 1 FOR UPDATE`,
        [orderId],
      );
    }

    if (!payment?.razorpay_payment_id) throw new Error("Payment not found");

    const refundAmount = Math.min(Number(amount), Number(payment.amount));
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      throw new Error("Invalid refund amount");
    }

    const [[existing]] = await conn.query(
      `SELECT refund_id, status, razorpay_refund_id
       FROM order_refunds WHERE refund_key = ? FOR UPDATE`,
      [key],
    );

    if (existing?.status === "completed") {
      await conn.commit();
      return { status: "completed", refundId: existing.refund_id };
    }

    if (existing) {
      refundId = existing.refund_id;
      await conn.query(
        `UPDATE order_refunds
         SET status = 'initiated', retry_count = retry_count + 1,
             last_retried_at = NOW(), last_error = NULL
         WHERE refund_id = ?`,
        [refundId],
      );
    } else {
      const [created] = await conn.query(
        `INSERT INTO order_refunds
          (order_id, order_item_id, payment_id, shipment_id, vendor_order_id, refund_amount,
           refund_method, status, refund_key, retry_count, last_retried_at)
         VALUES (?, ?, ?, ?, ?, ?, 'original', 'initiated', ?, 1, NOW())`,
        [
          orderId,
          orderItemId,
          payment.payment_id,
          shipmentId,
          vendorOrderId,
          refundAmount,
          key,
        ],
      );
      refundId = created.insertId;
    }

    await conn.commit();

    const refundResponse = await axios.post(
      `https://api.razorpay.com/v1/payments/${payment.razorpay_payment_id}/refund`,
      {
        amount: Math.round(refundAmount * 100),
        receipt: key,
        notes: { order_id: String(orderId), refund_key: key },
      },
      {
        auth: {
          username: process.env.RAZOR_API_KEY,
          password: process.env.RAZOR_SECRET_KEY,
        },
        headers: {
          "Content-Type": "application/json",
          "X-Refund-Idempotency": key,
        },
        timeout: 15000,
      },
    );
    const gatewayRefund = refundResponse.data;

    if (gatewayRefund.status === "failed") {
      throw new Error("Razorpay refund failed");
    }

    if (gatewayRefund.status === "processed") {
      await completeRefund(refundId, gatewayRefund);
      return { status: "completed", refundId, gatewayRefund };
    }

    await db.query(
      `UPDATE order_refunds
       SET status = 'initiated', razorpay_refund_id = ?, last_error = NULL
       WHERE refund_id = ?`,
      [gatewayRefund.id, refundId],
    );
    return { status: "initiated", refundId, gatewayRefund };
  } catch (error) {
    if (refundId) {
      await db.query(
        `UPDATE order_refunds SET status = 'failed', last_error = ?
         WHERE refund_id = ?`,
        [error.message, refundId],
      );
    } else {
      try {
        await conn.rollback();
      } catch {}
    }
    throw error;
  } finally {
    conn.release();
  }
}

async function retryPendingRefunds(limit = 20) {
  const [rows] = await db.query(
    `SELECT refund_id, order_id, order_item_id, payment_id, shipment_id, vendor_order_id,
            refund_amount, refund_key, razorpay_refund_id
     FROM order_refunds
     WHERE status IN ('pending', 'initiated', 'failed')
       AND (razorpay_refund_id IS NOT NULL OR retry_count < 8)
       AND (last_retried_at IS NULL OR last_retried_at < NOW() - INTERVAL 10 MINUTE)
     ORDER BY refund_id ASC LIMIT ?`,
    [limit],
  );

  const razorpay = getRazorpay();
  for (const row of rows) {
    try {
      if (row.razorpay_refund_id) {
        const gatewayRefund = await razorpay.refunds.fetch(
          row.razorpay_refund_id,
        );
        await db.query(
          `UPDATE order_refunds SET retry_count = retry_count + 1,
             last_retried_at = NOW() WHERE refund_id = ?`,
          [row.refund_id],
        );
        if (gatewayRefund.status === "processed") {
          await completeRefund(row.refund_id, gatewayRefund);
        } else if (gatewayRefund.status === "failed") {
          await db.query(
            `UPDATE order_refunds SET status = 'failed', last_error = ?
             WHERE refund_id = ?`,
            ["Razorpay reported refund failure", row.refund_id],
          );
        }
        continue;
      }

      await processRefund({
        orderId: row.order_id,
        orderItemId: row.order_item_id,
        paymentId: row.payment_id,
        shipmentId: row.shipment_id,
        vendorOrderId: row.vendor_order_id,
        amount: row.refund_amount,
        refundKey: row.refund_key,
      });
    } catch (error) {
      console.error(`[ECOM_REFUND_RETRY] Refund ${row.refund_id} failed:`, error);
    }
  }
}

module.exports = { processRefund, retryPendingRefunds };
