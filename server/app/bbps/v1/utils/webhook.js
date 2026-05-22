const db = require("../../../../config/database");
const TransactionModel = require("../models/transactionModel");
const ekoService = require("../services/eko_service");
const rechargeService = require("../services/recharge_service");

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
      const transactionId = payment.notes.transaction_id;

      const txn = await TransactionModel.getByIdForUpdate(transactionId, conn);

      if (!txn) return;

      //  DOUBLE EXECUTION PROTECTION
      if (txn.bbps_status === "PAID") {
        console.log("Skipping already paid txn:", txn.id);
        return;
      }

      try {
        let result;

        if (txn.fetch_bill === 1) {
          //  BBPS FLOW
          result = await ekoService.payBill({
            utility_acc_no: txn.utility_acc_no.trim(),
            operator_id: txn.operator_id,
            amount: txn.amount,
            cycle_number: txn.cycle_number,
          });
        } else {
          //  RECHARGE FLOW
          result = await rechargeService.recharge({
            mobile: txn.utility_acc_no.trim(),
            operator_id: txn.operator_id,
            amount: txn.amount,
          });
        }

        await TransactionModel.updateStatus(txn.id, "PAID", result, conn);

        await conn.commit();
      } catch (err) {
        await TransactionModel.updateStatus(
          txn.id,
          "FAILED_RETRY",
          err.message,
          conn,
        );

        await conn.commit();
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

      await db.execute(
        `UPDATE razorpay_orders
          SET status='failed',
              raw_response=?
          WHERE razorpay_order_id=?`,
        [JSON.stringify(body), razorpayOrderId],
      );

      await TransactionModel.updateStatus(txn.id, "FAILED_RETRY", body, conn);

      await conn.commit();
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
