const db = require("../../../../config/database");

class RefundModel {
  async queueForTransaction(transactionId, conn = db) {
    await conn.execute(
      `INSERT INTO bbps_refunds
       (transaction_id, razorpay_payment_id, amount, status)
       SELECT t.id, ro.razorpay_payment_id, t.amount, 'pending'
       FROM bbps_transactions t
       JOIN razorpay_orders ro
         ON ro.ref_id = CAST(t.id AS CHAR)
        AND ro.module = 'bbps'
        AND ro.status = 'success'
       WHERE t.id = ? AND ro.razorpay_payment_id IS NOT NULL
       ON DUPLICATE KEY UPDATE transaction_id = VALUES(transaction_id)`,
      [transactionId],
    );
  }

  async getRetryable(limit = 10) {
    const [rows] = await db.execute(
      `SELECT r.*, t.user_id
       FROM bbps_refunds r
       JOIN bbps_transactions t ON t.id = r.transaction_id
       WHERE (
         r.status IN ('pending', 'failed')
         OR (r.status = 'processing' AND r.last_retried_at < NOW() - INTERVAL 10 MINUTE)
       )
         AND r.retry_count < 5
       ORDER BY r.created_at ASC
       LIMIT ?`,
      [Number(limit)],
    );

    return rows;
  }

  async claim(id) {
    const [result] = await db.execute(
      `UPDATE bbps_refunds
       SET status = 'processing', retry_count = retry_count + 1,
           last_retried_at = NOW(), last_error = NULL
       WHERE id = ?
         AND (
           status IN ('pending', 'failed')
           OR (status = 'processing' AND last_retried_at < NOW() - INTERVAL 10 MINUTE)
         )
         AND retry_count < 5`,
      [id],
    );

    return result.affectedRows === 1;
  }

  async getById(id) {
    const [[row]] = await db.execute(
      `SELECT r.*, t.user_id
       FROM bbps_refunds r
       JOIN bbps_transactions t ON t.id = r.transaction_id
       WHERE r.id = ?`,
      [id],
    );
    return row || null;
  }

  async findForGatewayRefund(refund) {
    const transactionId = Number(refund?.notes?.transaction_id);
    const [[row]] = await db.execute(
      `SELECT r.*, t.user_id
       FROM bbps_refunds r
       JOIN bbps_transactions t ON t.id = r.transaction_id
       WHERE r.razorpay_refund_id = ?
          OR (? > 0 AND r.transaction_id = ?)
       LIMIT 1`,
      [refund?.id || "", transactionId, transactionId],
    );
    return row || null;
  }

  async markPending(id, refundId) {
    await db.execute(
      `UPDATE bbps_refunds
       SET status = 'processing', razorpay_refund_id = ?,
           last_error = NULL
       WHERE id = ? AND status <> 'completed'`,
      [refundId, id],
    );
  }

  async markCompleted(id, refundId = null) {
    const [result] = await db.execute(
      `UPDATE bbps_refunds
       SET status = 'completed',
           razorpay_refund_id = COALESCE(?, razorpay_refund_id),
           completed_at = NOW(),
           last_error = NULL
       WHERE id = ? AND status <> 'completed'`,
      [refundId, id],
    );
    return result.affectedRows === 1;
  }

  async markFailed(id, error) {
    await db.execute(
      `UPDATE bbps_refunds
       SET status = IF(retry_count >= 5, 'manual_review', 'failed'),
           last_error = ?
       WHERE id = ?`,
      [String(error || "Refund failed").slice(0, 2000), id],
    );
  }

  async markManualReview(id, refundId, error) {
    await db.execute(
      `UPDATE bbps_refunds
       SET status = 'manual_review',
           razorpay_refund_id = COALESCE(?, razorpay_refund_id),
           last_error = ?
       WHERE id = ? AND status <> 'completed'`,
      [
        refundId || null,
        String(error || "Refund requires manual review").slice(0, 2000),
        id,
      ],
    );
  }
}

module.exports = new RefundModel();
