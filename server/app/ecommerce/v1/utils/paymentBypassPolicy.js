const { parseAllowedUserIds } = require("./courierBookingPolicy");

const BYPASS_ORDER_PREFIX = "bypass_order_";
const BYPASS_PAYMENT_PREFIX = "bypass_pay_";
const BYPASS_REFUND_PREFIX = "bypass_rfnd_";

function shouldBypassPayment({
  userId,
  enabled = process.env.ECOMMERCE_PAYMENT_BYPASS ?? "false",
  allowedUserIds = process.env.ECOMMERCE_PAYMENT_BYPASS_USER_IDS ?? "",
}) {
  if (String(enabled).toLowerCase() !== "true") return false;
  return parseAllowedUserIds(allowedUserIds).has(Number(userId));
}

function bypassOrderId(orderId) {
  return `${BYPASS_ORDER_PREFIX}${orderId}`;
}

function bypassRefundId(refundId) {
  return `${BYPASS_REFUND_PREFIX}${refundId}`;
}

// No money moved for these payments, so Razorpay has nothing to refund.
function isBypassPayment(razorpayPaymentId) {
  return String(razorpayPaymentId || "").startsWith(BYPASS_PAYMENT_PREFIX);
}

// Same shape as a Razorpay webhook, so a bypassed order takes the real
// paid path: stock, coins, invoices, notifications and courier booking.
function buildBypassCaptureEvent({ orderId, amount }) {
  return {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: `${BYPASS_PAYMENT_PREFIX}${orderId}`,
          order_id: bypassOrderId(orderId),
          amount: Math.round(Number(amount) * 100),
          currency: "INR",
          method: "test_bypass",
        },
      },
    },
  };
}

module.exports = {
  buildBypassCaptureEvent,
  bypassOrderId,
  bypassRefundId,
  isBypassPayment,
  shouldBypassPayment,
};
