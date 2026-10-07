function getBookingDecision(order) {
  if (!order) return "not_found";
  if (order.status === "confirmed" && order.provider_booking_id) {
    return "already_confirmed";
  }
  if (order.payment_status === "paid" && order.status === "payment_success") {
    return "book";
  }
  return "payment_required";
}

function isExpectedCapturedPayment(payment, expected) {
  return Boolean(
    payment &&
      payment.order_id === expected.orderId &&
      Number(payment.amount) === Number(expected.amountPaise) &&
      String(payment.currency).toUpperCase() === "INR" &&
      String(payment.status).toLowerCase() === "captured",
  );
}

module.exports = {
  getBookingDecision,
  isExpectedCapturedPayment,
};
