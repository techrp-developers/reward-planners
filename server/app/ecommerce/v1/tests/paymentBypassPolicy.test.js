const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildBypassCaptureEvent,
  bypassOrderId,
  isBypassPayment,
  shouldBypassPayment,
} = require("../utils/paymentBypassPolicy");

test("payment bypass needs both the switch and an allowlisted user", () => {
  const allowed = { enabled: "true", allowedUserIds: "24,61" };

  assert.equal(shouldBypassPayment({ userId: 24, ...allowed }), true);
  assert.equal(shouldBypassPayment({ userId: 3, ...allowed }), false);
  assert.equal(
    shouldBypassPayment({ userId: 24, enabled: "false", allowedUserIds: "24" }),
    false,
  );
  assert.equal(
    shouldBypassPayment({ userId: 24, enabled: "true", allowedUserIds: "" }),
    false,
  );
});

test("payment bypass stays off when nothing is configured", () => {
  const saved = {
    enabled: process.env.ECOMMERCE_PAYMENT_BYPASS,
    ids: process.env.ECOMMERCE_PAYMENT_BYPASS_USER_IDS,
  };
  delete process.env.ECOMMERCE_PAYMENT_BYPASS;
  delete process.env.ECOMMERCE_PAYMENT_BYPASS_USER_IDS;

  try {
    assert.equal(shouldBypassPayment({ userId: 24 }), false);
  } finally {
    if (saved.enabled !== undefined) {
      process.env.ECOMMERCE_PAYMENT_BYPASS = saved.enabled;
    }
    if (saved.ids !== undefined) {
      process.env.ECOMMERCE_PAYMENT_BYPASS_USER_IDS = saved.ids;
    }
  }
});

test("the bypass event matches what the paid webhook path reads", () => {
  const event = buildBypassCaptureEvent({ orderId: 91, amount: "399.10" });
  const payment = event.payload.payment.entity;

  assert.equal(event.event, "payment.captured");
  assert.equal(payment.order_id, bypassOrderId(91));
  assert.equal(payment.amount, 39910);
  assert.equal(payment.currency, "INR");
  assert.equal(isBypassPayment(payment.id), true);
});

test("real Razorpay payments are never treated as bypassed", () => {
  assert.equal(isBypassPayment("pay_Nabc123"), false);
  assert.equal(isBypassPayment(null), false);
});
