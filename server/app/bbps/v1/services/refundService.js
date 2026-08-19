const axios = require("axios");
const razorpay = require("./razorpay_service");
const RefundModel = require("../models/refundModel");
const { notifyUser } = require("../../../common/utils/notification");

const notifyRefundCompleted = (refundRow) =>
  notifyUser(
    {
      userId: refundRow.user_id,
      module: "bbps",
      type: "bbps_refund_completed",
      title: "Payment refunded",
      message: `Your refund of Rs. ${Number(refundRow.amount).toFixed(2)} has been processed.`,
      icon: "receipt",
      reference_type: "bbps_transaction",
      reference_id: refundRow.transaction_id,
      action_url: `/bbps/transactions/${refundRow.transaction_id}`,
      priority: "high",
    },
    "bbps refund notification",
  );

const notifyRefundFailed = (refundRow) =>
  notifyUser(
    {
      userId: refundRow.user_id,
      module: "bbps",
      type: "bbps_refund_manual_review",
      title: "Refund needs attention",
      message:
        "Your bill-payment refund could not be completed automatically. Our team will review it.",
      icon: "alert-circle",
      reference_type: "bbps_transaction",
      reference_id: refundRow.transaction_id,
      action_url: `/bbps/transactions/${refundRow.transaction_id}`,
      priority: "high",
    },
    "bbps refund manual review notification",
  );

const completeRefund = async (refundRow, gatewayRefund) => {
  const transitioned = await RefundModel.markCompleted(
    refundRow.id,
    gatewayRefund?.id || null,
  );
  if (transitioned) notifyRefundCompleted(refundRow);
  return transitioned;
};

const failGatewayRefund = async (refundRow, gatewayRefund, message) => {
  if (refundRow.status === "completed") return false;
  const alreadyManual = refundRow.status === "manual_review";
  await RefundModel.markManualReview(
    refundRow.id,
    gatewayRefund?.id || null,
    message,
  );
  if (!alreadyManual) notifyRefundFailed(refundRow);
  return true;
};

const reconcileRefundEntity = async (gatewayRefund, eventName = null) => {
  if (!gatewayRefund?.id) return false;
  const refundRow = await RefundModel.findForGatewayRefund(gatewayRefund);
  if (!refundRow) return false;

  const status = String(gatewayRefund.status || "").toLowerCase();
  if (eventName === "refund.processed" || status === "processed") {
    await completeRefund(refundRow, gatewayRefund);
    return true;
  }
  if (eventName === "refund.failed" || status === "failed") {
    await failGatewayRefund(
      refundRow,
      gatewayRefund,
      "Razorpay reported that the BBPS refund failed.",
    );
    return true;
  }

  await RefundModel.markPending(refundRow.id, gatewayRefund.id);
  return true;
};

const findExistingGatewayRefund = async (refundRow) => {
  const response = await razorpay.payments.fetchMultipleRefund(
    refundRow.razorpay_payment_id,
  );
  const items = Array.isArray(response?.items) ? response.items : [];
  return (
    items.find(
      (item) =>
        String(item.notes?.module || "") === "bbps" &&
        String(item.notes?.transaction_id || "") ===
          String(refundRow.transaction_id),
    ) || null
  );
};

const createGatewayRefund = async (refundRow) => {
  const refundAmount = Math.round(Number(refundRow.amount) * 100);
  const refundKey = `bbps_${refundRow.transaction_id}_refund`;
  const response = await axios.post(
    `https://api.razorpay.com/v1/payments/${refundRow.razorpay_payment_id}/refund`,
    {
      amount: refundAmount,
      speed: "normal",
      receipt: refundKey,
      notes: {
        module: "bbps",
        transaction_id: String(refundRow.transaction_id),
        refund_key: refundKey,
      },
    },
    {
      auth: {
        username: process.env.RAZOR_API_KEY,
        password: process.env.RAZOR_SECRET_KEY,
      },
      headers: {
        "Content-Type": "application/json",
        "X-Refund-Idempotency": refundKey,
      },
      timeout: 15000,
    },
  );
  return response.data;
};

const processRefund = async (candidate) => {
  const claimed = await RefundModel.claim(candidate.id);
  if (!claimed) return;

  const refundRow = await RefundModel.getById(candidate.id);
  if (!refundRow) return;

  try {
    let gatewayRefund;

    if (refundRow.razorpay_refund_id) {
      gatewayRefund = await razorpay.refunds.fetch(
        refundRow.razorpay_refund_id,
      );
      await reconcileRefundEntity(gatewayRefund);
      return;
    }

    gatewayRefund = await findExistingGatewayRefund(refundRow);
    if (!gatewayRefund) {
      const payment = await razorpay.payments.fetch(
        refundRow.razorpay_payment_id,
      );
      const refundAmount = Math.round(Number(refundRow.amount) * 100);

      if (Number(payment.amount_refunded || 0) >= refundAmount) {
        await RefundModel.markManualReview(
          refundRow.id,
          null,
          "Payment is already refunded but no matching BBPS refund ID was found",
        );
        return;
      }

      gatewayRefund = await createGatewayRefund(refundRow);
    }

    await RefundModel.markPending(refundRow.id, gatewayRefund.id);
    await reconcileRefundEntity(gatewayRefund);
  } catch (error) {
    await RefundModel.markFailed(
      refundRow.id,
      error.response?.data?.error?.description ||
        error.error?.description ||
        error.message,
    );
    throw error;
  }
};

const processPendingRefunds = async () => {
  const rows = await RefundModel.getRetryable();

  for (const row of rows) {
    try {
      await processRefund(row);
    } catch (error) {
      console.error("[BBPS][refund] failed", {
        transaction_id: row.transaction_id,
        message: error.message,
      });
    }
  }
};

module.exports = { processPendingRefunds, reconcileRefundEntity };
