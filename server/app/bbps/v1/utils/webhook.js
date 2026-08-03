const db = require("../../../../config/database");
const TransactionModel = require("../models/transactionModel");
const { processTransaction } = require("../services/paymentProcessor");
const { notifyUser } = require("../../../common/utils/notification");

async function processEvent(req) {
  const conn = await db.getConnection();
  try {
    const body = req.parsedBody;
    const event = body.event;

    // =========================
    //  PAYMENT SUCCESS
    // =========================
    if (event === "payment.captured") {
      await conn.beginTransaction();

      const payment = body.payload.payment.entity;
      const [[rpOrder]] = await conn.execute(
        `SELECT ref_id, amount
         FROM razorpay_orders
         WHERE razorpay_order_id = ? AND module = 'bbps'
         FOR UPDATE`,
        [payment.order_id],
      );

      if (!rpOrder) {
        await conn.rollback();
        return;
      }

      if (Number(payment.amount) !== Math.round(Number(rpOrder.amount) * 100)) {
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

      //  DOUBLE EXECUTION PROTECTION
      if (txn.bbps_status === "PAID") {
        console.log("Skipping already paid txn:", txn.id);
        await conn.rollback();
        return;
      }

      await conn.execute(
        `UPDATE razorpay_orders
         SET status = 'success', razorpay_payment_id = ?, raw_response = ?
         WHERE razorpay_order_id = ? AND module = 'bbps'`,
        [payment.id, JSON.stringify(body), payment.order_id],
      );

      try {
        const result = await processTransaction(txn, req);

        await TransactionModel.updateStatus(txn.id, "PAID", result, conn);

        await conn.commit();

        notifyUser(
          {
            userId: txn.user_id,
            module: "bbps",
            type: "bbps_payment_success",
            title: "Payment Successful! ✅",
            message: `Your payment of Rs. ${Number(txn.amount).toFixed(2)} for ${txn.operator_id} was processed. A receipt has been generated.`,
            icon: "receipt",
            reference_type: "bbps_transaction",
            reference_id: txn.id,
            action_url: `/bbps/transactions/${txn.id}`,
            metadata: { operator_id: txn.operator_id },
          },
          "bbps webhook success notification",
        );
      } catch (err) {
        const failureStatus =
          err.retryable === false ? "FAILED_FINAL" : "FAILED_RETRY";
        const willRetry = failureStatus === "FAILED_RETRY";

        await TransactionModel.updateStatus(
          txn.id,
          failureStatus,
          err.providerResponse || err.message,
          conn,
        );

        await conn.commit();

        notifyUser(
          {
            userId: txn.user_id,
            module: "bbps",
            type: willRetry
              ? "bbps_payment_retry"
              : "bbps_payment_failed",
            title: willRetry ? "Bill payment pending" : "Bill payment failed",
            message: willRetry
              ? "Your payment was captured, but bill processing will be retried automatically."
              : "Your payment was captured, but the provider rejected the bill payment.",
            icon: willRetry ? "clock" : "x-circle",
            reference_type: "bbps_transaction",
            reference_id: txn.id,
            action_url: `/bbps/transactions/${txn.id}`,
            priority: "high",
            metadata: { operator_id: txn.operator_id },
          },
          "bbps webhook retry notification",
        );
      }
    }

    // =========================
    //  PAYMENT FAILED
    // =========================
    if (event === "payment.failed") {
      await conn.beginTransaction();

      const payment = body.payload.payment.entity;
      const razorpayOrderId = payment.order_id;

      const [[rpOrder]] = await conn.execute(
        `SELECT ref_id FROM razorpay_orders 
         WHERE razorpay_order_id=? 
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

      if (txn.bbps_status === "PAID") {
        await conn.rollback();
        return;
      }

      await conn.execute(
        `UPDATE razorpay_orders
          SET raw_response=?
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
