const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hasProviderFailureSignal,
  isEkoPaymentSuccessful,
} = require("../services/paymentProcessor");
const {
  shouldIgnoreCapturedEvent,
  shouldIgnoreFailedEvent,
} = require("../utils/paymentState");
const {
  buildPayBillHashPayload,
  formatPayBillAmount,
} = require("../utils/header");

test("EKO business responses are classified conservatively", () => {
  assert.equal(isEkoPaymentSuccessful({ status: 0 }), true);
  assert.equal(isEkoPaymentSuccessful({ status: "SUCCESS" }), true);
  assert.equal(isEkoPaymentSuccessful({ data: { status: 0 } }), true);
  assert.equal(isEkoPaymentSuccessful({ response_status_id: 0 }), true);
  assert.equal(isEkoPaymentSuccessful({ status: 97 }), false);
  assert.equal(
    isEkoPaymentSuccessful({ status: 0, response_type_id: -1 }),
    false,
  );
  assert.equal(isEkoPaymentSuccessful({}), false);
  assert.equal(hasProviderFailureSignal({}), false);
  assert.equal(hasProviderFailureSignal({ status: 97 }), true);
});

test("EKO paybill amount formatting is stable for request hash", () => {
  assert.equal(formatPayBillAmount("77.00"), "77");
  assert.equal(formatPayBillAmount(77), "77");
  assert.equal(formatPayBillAmount("77.50"), "77.5");
});

test("EKO paybill request hash includes timestamp without separators", () => {
  assert.equal(
    buildPayBillHashPayload("1626696381248", "151627591", "50", "20810200"),
    "16266963812481516275915020810200",
  );
});

test("duplicate captured events never re-run terminal provider states", () => {
  assert.equal(
    shouldIgnoreCapturedEvent({
      orderStatus: "success",
      transactionStatus: "FAILED_RETRY",
    }),
    true,
  );
  assert.equal(
    shouldIgnoreCapturedEvent({
      orderStatus: "created",
      transactionStatus: "FAILED_FINAL",
    }),
    true,
  );
  assert.equal(
    shouldIgnoreCapturedEvent({
      orderStatus: "created",
      transactionStatus: "INIT",
    }),
    false,
  );
});

test("late failed attempts cannot overwrite captured transaction states", () => {
  assert.equal(
    shouldIgnoreFailedEvent({
      orderStatus: "success",
      transactionStatus: "FAILED_RETRY",
    }),
    true,
  );
  assert.equal(
    shouldIgnoreFailedEvent({
      orderStatus: "created",
      razorpayPaymentId: "pay_123",
      transactionStatus: "INIT",
    }),
    true,
  );
  assert.equal(
    shouldIgnoreFailedEvent({
      orderStatus: "created",
      transactionStatus: "INIT",
    }),
    false,
  );
});
