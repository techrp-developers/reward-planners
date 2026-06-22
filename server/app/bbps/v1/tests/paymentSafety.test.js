const test = require("node:test");
const assert = require("node:assert/strict");
const { isEkoPaymentSuccessful } = require("../services/paymentProcessor");
const {
  shouldIgnoreCapturedEvent,
  shouldIgnoreFailedEvent,
} = require("../utils/paymentState");

test("EKO business responses are classified conservatively", () => {
  assert.equal(isEkoPaymentSuccessful({ status: 0 }), true);
  assert.equal(isEkoPaymentSuccessful({ status: "SUCCESS" }), true);
  assert.equal(isEkoPaymentSuccessful({ status: 97 }), false);
  assert.equal(
    isEkoPaymentSuccessful({ status: 0, response_type_id: -1 }),
    false,
  );
  assert.equal(isEkoPaymentSuccessful({}), false);
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
