const TERMINAL_PROVIDER_STATUSES = new Set([
  "PAID",
  "FAILED_FINAL",
  "RECONCILIATION_REQUIRED",
]);

const shouldIgnoreCapturedEvent = ({ orderStatus, transactionStatus }) =>
  orderStatus === "success" ||
  TERMINAL_PROVIDER_STATUSES.has(transactionStatus);

const shouldIgnoreFailedEvent = ({
  orderStatus,
  razorpayPaymentId,
  transactionStatus,
}) =>
  orderStatus === "success" ||
  Boolean(razorpayPaymentId) ||
  transactionStatus !== "INIT";

const hasRazorpayPaymentAttempts = (paymentCollection) =>
  Array.isArray(paymentCollection?.items) && paymentCollection.items.length > 0;

module.exports = {
  hasRazorpayPaymentAttempts,
  shouldIgnoreCapturedEvent,
  shouldIgnoreFailedEvent,
};
