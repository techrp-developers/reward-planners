function deriveServicePaymentStatus(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return "missing";

  const paymentStatuses = orders.map((order) =>
    String(order.payment_status || "pending").toLowerCase(),
  );
  const orderStatuses = orders.map((order) =>
    String(order.status || "pending_payment").toLowerCase(),
  );

  if (paymentStatuses.every((status) => status === "paid")) return "paid";
  if (
    paymentStatuses.every((status) => status === "failed") ||
    orderStatuses.every((status) => status === "cancelled")
  ) {
    return "failed";
  }
  return "pending";
}

module.exports = { deriveServicePaymentStatus };
