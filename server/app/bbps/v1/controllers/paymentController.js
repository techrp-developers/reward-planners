const crypto = require("crypto");
const TransactionModel = require("../models/transactionModel");
const razorpay = require("../services/razorpay_service");
const ekoService = require("../services/eko_service");
const rechargeService = require("../services/recharge_service");
const db = require("../../../../config/database");
const { notifyUser } = require("../../../common/utils/notification");

class PaymentController {
  //   create Order
  async createOrder(req, res) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        await conn.rollback();
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { operator_id, utility_acc_no, cycle_number } = req.body;
      const amount = Number(req.body.amount);
      const utilityAccountNo =
        typeof utility_acc_no === "string" ? utility_acc_no.trim() : "";

      if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid amount",
        });
      }

      if (!operator_id || !utilityAccountNo) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      // Operator Details
      const operator = await ekoService.getOperatorDetails(operator_id);

      if (!operator) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid operator",
        });
      }

      const operatorRecord =
        operator?.data?.data?.[0] || operator?.data || operator;

      const fetchBillFlag =
        operatorRecord?.fetchBill ??
        operatorRecord?.fetch_bill ??
        operatorRecord?.fetchbill ??
        1;

      // 1. create transaction
      const transaction_id = await TransactionModel.create(
        {
          user_id: userId,
          operator_id,
          utility_acc_no: utilityAccountNo,
          cycle_number,
          amount,
          fetch_bill: fetchBillFlag,
        },
        conn,
      );

      // 2. create razorpay order
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt: `bbps_${transaction_id}`,
        notes: {
          module: "bbps",
          transaction_id,
        },
      });

      await conn.execute(
        `INSERT INTO razorpay_orders
      (razorpay_order_id, receipt, amount, status, module, ref_id)
      VALUES (?, ?, ?, 'created', 'bbps', ?)`,
        [razorpayOrder.id, `bbps_${transaction_id}`, amount, transaction_id],
      );

      await conn.commit();

      res.json({
        success: true,
        data: {
          key: process.env.RAZOR_API_KEY,
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          transaction_id,
        },
      });
    } catch (err) {
      await conn.rollback();
      console.error("createOrder error:", err);

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      conn.release();
    }
  }

  //   verify Payment+Pay BBPS
  async verifyPayment(req, res) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const userId = req.user?.user_id;
      if (!userId) {
        await conn.rollback();
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        req.body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Missing payment verification fields",
        });
      }

      // verify signature
      const generated = crypto
        .createHmac("sha256", process.env.RAZOR_SECRET_KEY)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      const generatedBuffer = Buffer.from(generated, "hex");
      const signatureBuffer = Buffer.from(razorpay_signature, "hex");
      const isValid =
        generatedBuffer.length === signatureBuffer.length &&
        crypto.timingSafeEqual(generatedBuffer, signatureBuffer);

      if (!isValid) {
        await conn.rollback();
        return res.status(400).json({ error: "Invalid signature" });
      }

      //  FETCH PAYMENT FROM RAZORPAY (IMPORTANT)
      const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);

      if (paymentDetails.status !== "captured") {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Payment not captured",
        });
      }

      if (paymentDetails.order_id !== razorpay_order_id) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Payment does not belong to this order",
        });
      }

      //FETCH ORDER (LOCK)
      const [[rpOrder]] = await conn.execute(
        `SELECT * FROM razorpay_orders 
       WHERE razorpay_order_id = ? 
       FOR UPDATE`,
        [razorpay_order_id],
      );

      if (!rpOrder) {
        await conn.rollback();
        return res.status(404).json({
          success: false,
          message: "Razorpay order not found",
        });
      }

      // IDEMPOTENCY CHECK
      if (rpOrder.status === "success") {
        await conn.rollback();
        return res.json({
          success: true,
          message: "Already processed",
        });
      }

      if (rpOrder.status === "failed") {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Payment already failed",
        });
      }

      // DUPLICATE PAYMENT PROTECTION
      const [existingPayment] = await conn.execute(
        `SELECT id FROM razorpay_orders WHERE razorpay_payment_id=?`,
        [razorpay_payment_id],
      );

      if (existingPayment.length) {
        await conn.rollback();
        return res.json({
          success: true,
          message: "Already processed",
        });
      }

      // update payment
      await conn.execute(
        `UPDATE razorpay_orders
       SET status = 'success',
           razorpay_payment_id = ?,
           raw_response = ?
       WHERE razorpay_order_id = ?`,
        [razorpay_payment_id, JSON.stringify(req.body), razorpay_order_id],
      );

      // GET TRANSACTION (via ref_id)
      const txn = await TransactionModel.getByIdForUpdate(rpOrder.ref_id, conn);

      if (!txn) {
        await conn.rollback();
        return res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
      }

      if (Number(paymentDetails.amount) !== Math.round(Number(rpOrder.amount) * 100)) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Payment amount mismatch",
        });
      }

      if (Number(txn.user_id) !== Number(userId)) {
        await conn.rollback();
        return res.status(403).json({
          success: false,
          message: "Unauthorized transaction",
        });
      }

      // PREVENT DOUBLE BBPS
      if (txn.bbps_status === "PAID") {
        await conn.rollback();
        return res.json({
          success: true,
          message: "Already processed",
        });
      }

      console.info("[PAYMENT][VERIFY]", {
        txn_id: txn.id,
        operator_id: txn.operator_id,
        amount: txn.amount,
      });

      try {
        let result;

        if (txn.fetch_bill === 1) {
          //  BBPS FLOW
          result = await ekoService.payBill(
            {
              utility_acc_no: txn.utility_acc_no.trim(),
              operator_id: txn.operator_id,
              amount: txn.amount,
              cycle_number: txn.cycle_number,
            },
            req,
          );
        } else {
          //  RECHARGE FLOW
          result = await rechargeService.recharge({
            mobile: txn.utility_acc_no.trim(),
            operator_id: txn.operator_id,
            amount: txn.amount,
          });

          if (!result || result.status !== "SUCCESS") {
            throw new Error("Recharge failed");
          }
        }
        //  Success → mark PAID
        await TransactionModel.updateStatus(txn.id, "PAID", result, conn);

        await conn.commit();

        notifyUser(
          {
            userId,
            module: "bbps",
            type: "bbps_payment_success",
            title: "Bill payment successful",
            message: `Your payment of Rs. ${Number(txn.amount).toFixed(2)} was successful.`,
            icon: "receipt",
            reference_type: "bbps_transaction",
            reference_id: txn.id,
            action_url: `/bbps/transactions/${txn.id}`,
            metadata: { operator_id: txn.operator_id },
          },
          "bbps success notification",
        );

        return res.json({
          success: true,
          transaction_id: txn.id,
          result,
        });
      } catch (err) {
        console.error("BBPS Error:", err);

        //  MARK FOR RETRY (NOT FINAL FAILURE)
        await TransactionModel.updateStatus(
          txn.id,
          "FAILED_RETRY",
          err.message,
          conn,
        );

        await conn.commit();

        notifyUser(
          {
            userId,
            module: "bbps",
            type: "bbps_payment_retry",
            title: "Bill payment pending",
            message: "Your payment was captured, but bill processing will be retried automatically.",
            icon: "clock",
            reference_type: "bbps_transaction",
            reference_id: txn.id,
            action_url: `/bbps/transactions/${txn.id}`,
            priority: "high",
            metadata: { operator_id: txn.operator_id },
          },
          "bbps retry notification",
        );

        return res.status(500).json({
          success: false,
          message: "Payment successful, bill will be retried automatically",
        });
      }
    } catch (err) {
      await conn.rollback();
      console.error("verifyPayment error:", err);

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    } finally {
      conn.release();
    }
  }

  // Retry Transaction
  async retryTransaction(req, res) {
    const conn = await db.getConnection();
    let transaction_id;
    let txn;

    try {
      await conn.beginTransaction();
      transaction_id = req.body.transaction_id;
      const userId = req.user?.user_id;

      if (!userId) {
        await conn.rollback();
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      txn = await TransactionModel.getByIdForUpdate(transaction_id, conn);

      if (!txn) {
        await conn.rollback();
        return res.status(404).json({
          message: "Transaction not found",
        });
      }

      if (Number(txn.user_id) !== Number(userId)) {
        await conn.rollback();
        return res.status(403).json({
          success: false,
          message: "Unauthorized transaction",
        });
      }

      if (txn.bbps_status === "PAID") {
        await conn.rollback();
        return res.json({
          success: true,
          message: "Already processed",
        });
      }

      if (txn.retry_count >= txn.max_retry) {
        await conn.rollback();
        return res.status(400).json({
          message: "Max retry reached",
        });
      }

      let result;

      if (Number(txn.fetch_bill) === 1) {
        result = await ekoService.payBill({
          utility_acc_no: txn.utility_acc_no.trim(),
          operator_id: txn.operator_id,
          amount: txn.amount,
          cycle_number: txn.cycle_number,
        });
      } else {
        result = await rechargeService.recharge({
          mobile: txn.utility_acc_no.trim(),
          operator_id: txn.operator_id,
          amount: txn.amount,
        });

        if (!result || result.status !== "SUCCESS") {
          throw new Error("Recharge failed");
        }
      }

      await TransactionModel.updateStatus(txn.id, "PAID", result, conn);

      await conn.commit();

      notifyUser(
        {
          userId,
          module: "bbps",
          type: "bbps_retry_success",
          title: "Bill payment completed",
          message: `Your payment of Rs. ${Number(txn.amount).toFixed(2)} completed successfully.`,
          icon: "receipt",
          reference_type: "bbps_transaction",
          reference_id: txn.id,
          action_url: `/bbps/transactions/${txn.id}`,
        },
        "bbps retry success notification",
      );

      return res.json({ success: true, result });
    } catch (err) {
      await conn.rollback();

      if (txn && txn.retry_count + 1 >= txn.max_retry) {
        await TransactionModel.updateStatus(
          txn.id,
          "FAILED_FINAL",
          err.message,
        );
      } else {
        await TransactionModel.incrementRetry(transaction_id);
      }

      return res.status(500).json({
        success: false,
        message: "Retry failed",
      });
    } finally {
      conn.release();
    }
  }
}

module.exports = new PaymentController();
