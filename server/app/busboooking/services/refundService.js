const axios = require("axios");
const db = require("../../../config/database");
const razorpay = require("../../service/v1/middlewares/razorpay");
const { sendOpsAlert } = require("../../../services/alertService");

const MAX_REFUND_ATTEMPTS = 8;

// Records that a refund is owed. Must run inside the transaction that decides
// the refund so the decision and the debt are committed together.
async function enqueueRefund(conn, {
  orderId,
  userId,
  reason,
  refundKey,
  amount,
  cancellationId = null,
}) {
  await conn.execute(
    `INSERT INTO busbooking_refunds
       (busbooking_order_id, cancellation_id, user_id, reason, refund_key, amount)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [orderId, cancellationId, userId, reason, refundKey, amount],
  );

  const [[row]] = await conn.execute(
    `SELECT id FROM busbooking_refunds WHERE refund_key = ? LIMIT 1`,
    [refundKey],
  );
  return row.id;
}

async function completeRefund(refundId, gatewayRefundId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[refund]] = await conn.execute(
      `SELECT id, busbooking_order_id, cancellation_id, status
         FROM busbooking_refunds
        WHERE id = ?
        FOR UPDATE`,
      [refundId],
    );
    if (!refund) {
      await conn.rollback();
      return;
    }

    await conn.execute(
      `UPDATE busbooking_refunds
          SET status = 'processed',
              razorpay_refund_id = COALESCE(?, razorpay_refund_id),
              last_error = NULL
        WHERE id = ?`,
      [gatewayRefundId || null, refundId],
    );

    if (refund.cancellation_id) {
      await conn.execute(
        `UPDATE busbooking_cancellations
            SET refund_status = 'processed'
          WHERE id = ?`,
        [refund.cancellation_id],
      );
    }

    const [[totals]] = await conn.execute(
      `SELECT COALESCE(SUM(r.amount), 0) AS refunded,
              o.total_amount - o.reward_coins_used AS paid
         FROM busbooking_orders o
         LEFT JOIN busbooking_refunds r
           ON r.busbooking_order_id = o.id AND r.status = 'processed'
        WHERE o.id = ?
        GROUP BY o.id`,
      [refund.busbooking_order_id],
    );
    if (totals && Number(totals.refunded) >= Number(totals.paid)) {
      await conn.execute(
        `UPDATE busbooking_orders SET payment_status = 'refunded' WHERE id = ?`,
        [refund.busbooking_order_id],
      );
    }

    await conn.commit();
  } catch (error) {
    try {
      await conn.rollback();
    } catch {}
    throw error;
  } finally {
    conn.release();
  }
}

// `final` marks a failure that retrying cannot fix (the gateway itself gave up).
async function failRefund(refundId, message, { final = false } = {}) {
  const [[refund]] = await db.execute(
    `SELECT id, cancellation_id, attempts, refund_key
       FROM busbooking_refunds
      WHERE id = ?`,
    [refundId],
  );
  if (!refund) return;

  await db.execute(
    `UPDATE busbooking_refunds
        SET status = 'failed', last_error = ?
      WHERE id = ? AND status <> 'processed'`,
    [String(message || "Refund failed").slice(0, 1000), refundId],
  );

  if (final || Number(refund.attempts) >= MAX_REFUND_ATTEMPTS) {
    if (refund.cancellation_id) {
      await db.execute(
        `UPDATE busbooking_cancellations
            SET refund_status = 'failed'
          WHERE id = ? AND refund_status <> 'processed'`,
        [refund.cancellation_id],
      );
    }
    await sendOpsAlert({
      level: "critical",
      category: "busbooking_refund",
      message: `Bus-booking refund ${refund.refund_key} needs manual handling`,
      meta: { refundId, attempts: refund.attempts, error: message },
    });
  }
}

// Sends one owed refund to Razorpay. Safe to call repeatedly and concurrently:
// the refund key is the gateway idempotency key, so a retry after a timeout
// returns the original refund instead of paying out twice. Never throws; an
// attempt that does not finish is picked up again by the cron.
async function processRefund(refundId) {
  const conn = await db.getConnection();
  let refund;
  let claimed = false;

  try {
    await conn.beginTransaction();

    [[refund]] = await conn.execute(
      `SELECT r.id, r.refund_key, r.amount, r.status, r.razorpay_refund_id,
              o.order_ref
         FROM busbooking_refunds r
         JOIN busbooking_orders o ON o.id = r.busbooking_order_id
        WHERE r.id = ?
        FOR UPDATE`,
      [refundId],
    );

    if (!refund) {
      await conn.rollback();
      return { status: "not_found" };
    }
    if (refund.status === "processed" || refund.razorpay_refund_id) {
      await conn.commit();
      return { status: refund.status };
    }

    const [[payment]] = await conn.execute(
      `SELECT razorpay_payment_id
         FROM razorpay_orders
        WHERE ref_id = ?
          AND module = 'busbooking'
          AND status = 'success'
          AND razorpay_payment_id IS NOT NULL
        ORDER BY id DESC
        LIMIT 1`,
      [refund.order_ref],
    );

    await conn.execute(
      `UPDATE busbooking_refunds
          SET status = 'initiated', attempts = attempts + 1,
              last_attempt_at = NOW(), razorpay_payment_id = ?, last_error = NULL
        WHERE id = ?`,
      [payment?.razorpay_payment_id || null, refundId],
    );
    await conn.commit();
    claimed = true;

    if (!payment?.razorpay_payment_id) {
      throw new Error("Captured Razorpay payment not found for refund");
    }

    const response = await axios.post(
      `https://api.razorpay.com/v1/payments/${payment.razorpay_payment_id}/refund`,
      {
        amount: Math.round(Number(refund.amount) * 100),
        receipt: refund.refund_key,
        notes: {
          module: "busbooking",
          refund_key: refund.refund_key,
          order_ref: refund.order_ref,
        },
      },
      {
        auth: {
          username: process.env.RAZOR_API_KEY,
          password: process.env.RAZOR_SECRET_KEY,
        },
        headers: {
          "Content-Type": "application/json",
          "X-Refund-Idempotency": refund.refund_key,
        },
        timeout: 15000,
      },
    );
    const gatewayRefund = response.data;

    if (gatewayRefund.status === "failed") {
      throw new Error("Razorpay refund failed");
    }

    if (gatewayRefund.status === "processed") {
      await completeRefund(refundId, gatewayRefund.id);
      return { status: "processed" };
    }

    await db.execute(
      `UPDATE busbooking_refunds SET razorpay_refund_id = ? WHERE id = ?`,
      [gatewayRefund.id, refundId],
    );
    return { status: "initiated" };
  } catch (error) {
    if (!claimed) {
      try {
        await conn.rollback();
      } catch {}
      console.error("[BusBooking][Refund] Could not start refund", {
        refundId,
        message: error.message,
      });
      return { status: "pending" };
    }

    const message =
      error.response?.data?.error?.description || error.message;
    console.error("[BusBooking][Refund] Refund attempt failed", {
      refundId,
      message,
    });
    await failRefund(refundId, message);
    return { status: "failed" };
  } finally {
    conn.release();
  }
}

async function findRefundForEntity(entity) {
  const refundKey = entity?.notes?.refund_key || null;
  const [[row]] = await db.execute(
    `SELECT id
       FROM busbooking_refunds
      WHERE razorpay_refund_id = ? OR refund_key = ?
      LIMIT 1`,
    [entity.id, refundKey],
  );
  return row || null;
}

// refund.processed / refund.failed webhook events.
async function reconcileRefundEntity(entity, event) {
  if (!entity?.id) return;

  const row = await findRefundForEntity(entity);
  if (!row) {
    console.warn("[BusBooking][Refund] Webhook for unknown refund", {
      refund_id: entity.id,
    });
    return;
  }

  if (event === "refund.processed") {
    await completeRefund(row.id, entity.id);
  } else if (event === "refund.failed") {
    await failRefund(row.id, "Razorpay reported refund failure", { final: true });
  }
}

async function retryPendingRefunds(limit = 20) {
  const [rows] = await db.query(
    `SELECT id, razorpay_refund_id
       FROM busbooking_refunds
      WHERE (
              (razorpay_refund_id IS NULL
                AND status IN ('pending', 'initiated', 'failed')
                AND attempts < ?)
              OR (razorpay_refund_id IS NOT NULL AND status = 'initiated')
            )
        AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - INTERVAL 10 MINUTE)
      ORDER BY id ASC
      LIMIT ?`,
    [MAX_REFUND_ATTEMPTS, limit],
  );

  for (const row of rows) {
    try {
      if (!row.razorpay_refund_id) {
        await processRefund(row.id);
        continue;
      }

      const gatewayRefund = await razorpay.refunds.fetch(row.razorpay_refund_id);
      await db.execute(
        `UPDATE busbooking_refunds SET last_attempt_at = NOW() WHERE id = ?`,
        [row.id],
      );
      if (gatewayRefund.status === "processed") {
        await completeRefund(row.id, gatewayRefund.id);
      } else if (gatewayRefund.status === "failed") {
        await failRefund(row.id, "Razorpay reported refund failure", { final: true });
      }
    } catch (error) {
      console.error(`[BusBooking][Refund] Retry of refund ${row.id} failed`, error.message);
    }
  }
}

module.exports = {
  enqueueRefund,
  processRefund,
  reconcileRefundEntity,
  retryPendingRefunds,
};
