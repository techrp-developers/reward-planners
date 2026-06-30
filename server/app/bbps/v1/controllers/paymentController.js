const crypto = require("crypto");
const TransactionModel = require("../models/transactionModel");
const BillFetchModel = require("../models/billFetchModel");
const RefundModel = require("../models/refundModel");
const razorpay = require("../services/razorpay_service");
const ekoService = require("../services/eko_service");
const { processTransaction } = require("../services/paymentProcessor");
const db = require("../../../../config/database");
const { notifyUser } = require("../../../common/utils/notification");

class PaymentController {
  //   create Order
  async createOrder(req, res) {
    const conn = await db.getConnection();
    let razorpayOrder = null;

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

      const { operator_id, bill_fetch_id, plan_id, circle_id } = req.body;

      if (!operator_id) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "operator_id is required",
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
        (operator?.operator_id || operator?.fetchBill !== undefined)
          ? operator
          : operator?.data?.data?.[0] || operator?.data?.[0] || null;

      const rawFetchBillFlag =
        operatorRecord?.fetchBill ??
        operatorRecord?.fetch_bill ??
        operatorRecord?.fetchbill;

      if (rawFetchBillFlag === undefined || rawFetchBillFlag === null) {
        await conn.rollback();
        return res.status(502).json({
          success: false,
          message: "Operator response did not specify the payment flow",
        });
      }

      const fetchBillFlag = ["1", "true", "yes"].includes(
        String(rawFetchBillFlag).trim().toLowerCase(),
      )
        ? 1
        : 0;

      let amount;
      let utilityAccountNo;
      let cycleNumber = req.body.cycle_number || null;
      let confirmationMobileNo = req.body.confirmation_mobile_no || null;
      let senderName = req.body.sender_name || null;
      let billFetchId = null;
      let providerBillRefId = null;
      let rechargePlanId = null;
      let rechargeCircleId = null;

      if (fetchBillFlag === 1) {
        if (!bill_fetch_id) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message: "bill_fetch_id is required for BBPS payments",
          });
        }

        const fetchedBill = await BillFetchModel.getValidByIdForUpdate(
          bill_fetch_id,
          userId,
          conn,
        );

        if (!fetchedBill) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message: "Fetched bill is invalid, expired, or already used",
          });
        }

        if (String(fetchedBill.operator_id) !== String(operator_id)) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message: "Fetched bill does not belong to this operator",
          });
        }

        amount = Number(fetchedBill.amount);
        utilityAccountNo = String(fetchedBill.utility_acc_no).trim();
        cycleNumber = fetchedBill.cycle_number;
        confirmationMobileNo = fetchedBill.confirmation_mobile_no;
        senderName = fetchedBill.sender_name;
        billFetchId = fetchedBill.id;
        providerBillRefId = fetchedBill.provider_ref_id;
      } else {
        utilityAccountNo = String(req.body.utility_acc_no || "").trim();
        senderName = String(req.body.sender_name || "").trim();

        if (
          !/^[1-9][0-9]{9}$/.test(utilityAccountNo) ||
          !plan_id ||
          !senderName
        ) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message:
              "A valid mobile number, plan_id, and sender_name are required",
          });
        }

        const planResponse = await ekoService.getRechargePlans({
          mobile: utilityAccountNo,
          operatorCode: String(operator_id),
          circleId: circle_id ? String(circle_id) : "",
        });
        const selectedPlan = planResponse.plans.find(
          (plan) => plan.planId === String(plan_id),
        );

        if (!selectedPlan) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message: "Selected recharge plan is invalid or no longer available",
          });
        }

        amount = Number(selectedPlan.amount);
        confirmationMobileNo = utilityAccountNo;
        rechargePlanId = selectedPlan.planId;
        rechargeCircleId = circle_id ? String(circle_id) : null;
      }

      if (
        !utilityAccountNo ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 5000
      ) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid account or amount",
        });
      }

      const providerClientRefId = `${Date.now()}${crypto.randomInt(100, 1000)}`;

      // 1. create transaction
      const transaction_id = await TransactionModel.create(
        {
          user_id: userId,
          operator_id,
          utility_acc_no: utilityAccountNo,
          cycle_number: cycleNumber,
          confirmation_mobile_no: confirmationMobileNo,
          sender_name: senderName,
          amount,
          fetch_bill: fetchBillFlag,
          bill_fetch_id: billFetchId,
          provider_client_ref_id: providerClientRefId,
          provider_bill_ref_id: providerBillRefId,
          recharge_plan_id: rechargePlanId,
          recharge_circle_id: rechargeCircleId,
        },
        conn,
      );

      if (billFetchId) {
        await BillFetchModel.markConsumed(billFetchId, conn);
      }

      // 2. create razorpay order
      razorpayOrder = await razorpay.orders.create({
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

      if (razorpayOrder?.id) {
        razorpay.orders.cancel(razorpayOrder.id).catch((cancelError) => {
          console.error("[BBPS][create-order] orphan cancellation failed", {
            razorpay_order_id: razorpayOrder.id,
            message: cancelError.message,
          });
        });
      }

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
        const existingTxn = await TransactionModel.getByIdForUpdate(
          rpOrder.ref_id,
          conn,
        );

        if (!existingTxn || Number(existingTxn.user_id) !== Number(userId)) {
          await conn.rollback();
          return res.status(403).json({
            success: false,
            message: "Unauthorized transaction",
          });
        }

        await conn.rollback();
        return res.json({
          success: existingTxn.bbps_status === "PAID",
          message: "Payment was already verified",
          transaction_id: existingTxn.id,
          status: existingTxn.bbps_status,
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
        const result = await processTransaction(txn, req);
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
        console.error("[BBPS][verify-payment][provider] error", {
          transaction_id: txn.id,
          statusCode: err.statusCode || err.response?.status || 500,
          message: err.message,
          retryable: err.retryable !== false,
          providerResponse: err.providerResponse,
        });

        const failureStatus =
          err.retryable === false ? "FAILED_FINAL" : "FAILED_RETRY";
        const willRetry = failureStatus === "FAILED_RETRY";

        await TransactionModel.updateStatus(
          txn.id,
          failureStatus,
          err.providerResponse || err.message,
          conn,
        );

        if (failureStatus === "FAILED_FINAL") {
          await RefundModel.queueForTransaction(txn.id, conn);
        }

        await conn.commit();

        notifyUser(
          {
            userId,
            module: "bbps",
            type: willRetry
              ? "bbps_payment_retry"
              : "bbps_payment_failed",
            title: willRetry ? "Bill payment pending" : "Bill payment failed",
            message: willRetry
              ? "Your payment was captured, but bill processing will be retried automatically."
              : "The provider rejected the bill payment. Your refund has been initiated.",
            icon: willRetry ? "clock" : "x-circle",
            reference_type: "bbps_transaction",
            reference_id: txn.id,
            action_url: `/bbps/transactions/${txn.id}`,
            priority: "high",
            metadata: { operator_id: txn.operator_id },
          },
          "bbps retry notification",
        );

        return res.status(err.retryable === false ? 422 : 202).json({
          success: false,
          message:
            err.retryable === false
              ? "The provider rejected the transaction and a refund was initiated"
              : "Payment was captured and bill processing will be retried automatically",
          transaction_id: txn.id,
        });
      }
    } catch (err) {
      await conn.rollback();
      console.error("[BBPS][verify-payment] error", {
        statusCode: err.statusCode || err.response?.status || 500,
        message: err.message,
      });

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

      if (txn.bbps_status !== "FAILED_RETRY") {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Transaction is not eligible for retry",
        });
      }

      const result = await processTransaction(txn, req);

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

      if (txn) {
        await conn.beginTransaction();

        if (err.retryable === false) {
          await TransactionModel.updateStatus(
            txn.id,
            "FAILED_FINAL",
            err.providerResponse || err.message,
            conn,
          );
          await RefundModel.queueForTransaction(txn.id, conn);
        } else if (txn.retry_count + 1 >= txn.max_retry) {
          await TransactionModel.updateStatus(
            txn.id,
            "RECONCILIATION_REQUIRED",
            err.providerResponse || err.message,
            conn,
          );
        } else {
          await TransactionModel.incrementRetry(transaction_id, conn);
        }

        await conn.commit();
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
