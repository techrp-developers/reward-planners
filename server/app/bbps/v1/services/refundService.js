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

const processRefund = async (refundRow) => {
  const claimed = await RefundModel.claim(refundRow.id);
  if (!claimed) return;

  try {
    const payment = await razorpay.payments.fetch(
      refundRow.razorpay_payment_id,
    );
    const refundAmount = Math.round(Number(refundRow.amount) * 100);

    if (Number(payment.amount_refunded || 0) >= refundAmount) {
      await RefundModel.markCompleted(refundRow.id);
      notifyRefundCompleted(refundRow);
      return;
    }

    const refund = await razorpay.payments.refund(
      refundRow.razorpay_payment_id,
      {
        amount: refundAmount,
        speed: "normal",
        notes: {
          module: "bbps",
          transaction_id: String(refundRow.transaction_id),
        },
      },
    );

    await RefundModel.markCompleted(refundRow.id, refund.id);
    notifyRefundCompleted(refundRow);
  } catch (error) {
    await RefundModel.markFailed(
      refundRow.id,
      error.error?.description || error.message,
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

module.exports = { processPendingRefunds };
