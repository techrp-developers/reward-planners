const db = require("../../../../config/database");
const TransactionModel = require("../models/transactionModel");
const { notifyUser } = require("../../../common/utils/notification");
const {
  shouldIgnoreCapturedEvent,
  shouldIgnoreFailedEvent,
} = require("./paymentState");
const RefundService = require("../services/refundService");

async function processEvent(req) {
  const conn = await db.getConnection();
  try {
    const body = req.parsedBody;
    const event = body.event;

    if (event === "refund.processed" || event === "refund.failed") {
      const refund = body?.payload?.refund?.entity;
      if (refund) {
        await RefundService.reconcileRefundEntity(refund, event);
      }
      return;
    }

    // =========================
    //  PAYMENT SUCCESS
    // =========================
    if (event === "payment.captured") {
      await conn.beginTransaction();

      const payment = body.payload.payment.entity;
      const [[rpOrder]] = await conn.execute(
        `SELECT ref_id, amount, status, razorpay_payment_id
         FROM razorpay_orders
         WHERE razorpay_order_id = ? AND module = 'bbps'
         FOR UPDATE`,
        [payment.order_id],
      );

      if (!rpOrder) {
        await conn.rollback();
        return;
      }

      if (
        payment.currency !== "INR" ||
        Number(payment.amount) !== Math.round(Number(rpOrder.amount) * 100)
      ) {
        throw new Error("Captured Razorpay payment amount mismatch");
      }

      const txn = await TransactionModel.getByIdForUpdate(
        rpOrder.ref_id,
        conn,
      );

      if (!txn) {
        await conn.rollback();
        return;
      }

      if (
        shouldIgnoreCapturedEvent({
          orderStatus: rpOrder.status,
          transactionStatus: txn.bbps_status,
        })
      ) {
        console.log("Skipping duplicate captured webhook:", payment.order_id);
        await conn.rollback();
        return;
      }

      await conn.execute(
        `UPDATE razorpay_orders
         SET status = 'success', razorpay_payment_id = ?, raw_response = ?
         WHERE razorpay_order_id = ? AND module = 'bbps'`,
        [payment.id, JSON.stringify(body), payment.order_id],
      );

      await TransactionModel.updateStatus(
        txn.id,
        "FAILED_RETRY",
        { message: "Razorpay payment captured; provider processing queued" },
        conn,
      );

      await conn.commit();

      notifyUser(
        {
          userId: txn.user_id,
          module: "bbps",
          type: "bbps_payment_retry",
          title: "Bill payment processing",
          message:
            "Your payment was captured and bill processing is continuing.",
          icon: "clock",
          reference_type: "bbps_transaction",
          reference_id: txn.id,
          action_url: `/bbps/transactions/${txn.id}`,
          priority: "high",
          metadata: { operator_id: txn.operator_id },
        },
        "bbps webhook processing notification",
      );
    }

    // =========================
    //  PAYMENT FAILED
    // =========================
    if (event === "payment.failed") {
      await conn.beginTransaction();

      const payment = body.payload.payment.entity;
      const razorpayOrderId = payment.order_id;

      const [[rpOrder]] = await conn.execute(
        `SELECT ref_id, status, razorpay_payment_id FROM razorpay_orders
         WHERE razorpay_order_id=? AND module = 'bbps'
         FOR UPDATE`,
        [razorpayOrderId],
      );

      if (!rpOrder) {
        await conn.rollback();
        return;
      }

      const txn = await TransactionModel.getByIdForUpdate(rpOrder.ref_id, conn);

      if (!txn) {
        await conn.rollback();
        return;
      }

      if (
        shouldIgnoreFailedEvent({
          orderStatus: rpOrder.status,
          razorpayPaymentId: rpOrder.razorpay_payment_id,
          transactionStatus: txn.bbps_status,
        })
      ) {
        await conn.rollback();
        return;
      }

      await conn.execute(
        `UPDATE razorpay_orders
          SET status='failed', raw_response=?
          WHERE razorpay_order_id=?`,
        [JSON.stringify(body), razorpayOrderId],
      );

      await TransactionModel.updateStatus(txn.id, "PAYMENT_FAILED", body, conn);

      await conn.commit();

      notifyUser(
        {
          userId: txn.user_id,
          module: "bbps",
          type: "bbps_payment_failed",
          title: "Bill payment failed",
          message: "Your bill payment failed. Please try again.",
          icon: "x-circle",
          reference_type: "bbps_transaction",
          reference_id: txn.id,
          action_url: `/bbps/transactions/${txn.id}`,
          priority: "high",
        },
        "bbps webhook failed notification",
      );
    }
  } catch (err) {
    await conn.rollback();
    console.error("Webhook error:", err);
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { processEvent };
