const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getBookingDecision,
  isExpectedCapturedPayment,
} = require("../utils/workflowPolicy");

test("booking requires the local order to have a captured payment", () => {
  assert.equal(getBookingDecision(null), "not_found");
  assert.equal(
    getBookingDecision({ status: "pending_payment", payment_status: "pending" }),
    "payment_required",
  );
  assert.equal(
    getBookingDecision({ status: "payment_success", payment_status: "paid" }),
    "book",
  );
});

test("confirmed bookings are idempotently reused", () => {
  assert.equal(
    getBookingDecision({
      status: "confirmed",
      payment_status: "paid",
      provider_booking_id: "booking-1",
    }),
    "already_confirmed",
  );
});

test("payment verification requires captured matching Razorpay payment", () => {
  const expected = { orderId: "order-1", amountPaise: 12500 };
  const payment = {
    order_id: "order-1",
    amount: 12500,
    currency: "INR",
    status: "captured",
  };

  assert.equal(isExpectedCapturedPayment(payment, expected), true);
  assert.equal(isExpectedCapturedPayment({ ...payment, amount: 12400 }, expected), false);
  assert.equal(isExpectedCapturedPayment({ ...payment, status: "authorized" }, expected), false);
  assert.equal(isExpectedCapturedPayment({ ...payment, order_id: "order-2" }, expected), false);
});
