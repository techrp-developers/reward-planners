const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getBookingDecision,
  isExpectedCapturedPayment,
  getBlockTtlMinutes,
  isBlockExpired,
  isAmbiguousProviderError,
  classifyBookOutcome,
  classifyCancellationEntry,
  getRefundableAmount,
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

test("an order already being booked or reviewed is never booked again", () => {
  const paid = { payment_status: "paid" };
  assert.equal(getBookingDecision({ ...paid, status: "booking_in_progress" }), "in_progress");
  assert.equal(getBookingDecision({ ...paid, status: "booking_review" }), "under_review");
  assert.equal(getBookingDecision({ ...paid, status: "booking_failed" }), "failed");
  assert.equal(getBookingDecision({ payment_status: "refunded", status: "booking_failed" }), "failed");
  assert.equal(getBookingDecision({ payment_status: "pending", status: "expired" }), "payment_required");
});

test("seat holds expire once the provider TTL has elapsed", () => {
  assert.equal(getBlockTtlMinutes({}), 8);
  assert.equal(getBlockTtlMinutes({ BUS_BLOCK_TTL_MINUTES: "5" }), 5);
  assert.equal(getBlockTtlMinutes({ BUS_BLOCK_TTL_MINUTES: "abc" }), 8);
  assert.equal(isBlockExpired(479, 8), false);
  assert.equal(isBlockExpired(480, 8), true);
});

test("book outcome is confirmed only for a successful booking with an id", () => {
  const result = classifyBookOutcome({
    data: {
      Error: { ErrorCode: 0 },
      BookingId: 991,
      Result: { BusBookingStatus: "Success", TicketNo: "T1", TravelOperatorPNR: "P1" },
    },
  });
  assert.equal(result.outcome, "confirmed");
  assert.equal(result.bookingId, "991");
  assert.equal(result.ticketNo, "T1");
});

test("book outcome is failed only when the provider definitely refused", () => {
  assert.equal(
    classifyBookOutcome({ data: { Error: { ErrorCode: 12, ErrorMessage: "Block expired" } } }).outcome,
    "failed",
  );
  assert.equal(
    classifyBookOutcome({ error: { response: { status: 400, data: {} } } }).outcome,
    "failed",
  );
});

test("book outcome is unknown whenever a ticket might still exist", () => {
  const timeout = { code: "ECONNABORTED", message: "timeout of 30000ms exceeded" };
  assert.equal(classifyBookOutcome({ error: timeout }).outcome, "unknown");
  assert.equal(classifyBookOutcome({ error: { response: { status: 502 } } }).outcome, "unknown");
  assert.equal(classifyBookOutcome({ data: { Error: { ErrorCode: 0 } } }).outcome, "unknown");
  assert.equal(
    classifyBookOutcome({
      data: { BookingId: 5, Result: { BusBookingStatus: "Pending" } },
    }).outcome,
    "unknown",
  );
  assert.equal(isAmbiguousProviderError(timeout), true);
  assert.equal(isAmbiguousProviderError({ response: { status: 401 } }), false);
});

test("book in-progress and manual-check provider codes never trigger a refund", () => {
  for (const errorCode of [7031, 7033]) {
    assert.equal(
      classifyBookOutcome({
        data: { Error: { ErrorCode: errorCode, ErrorMessage: "Review required" } },
      }).outcome,
      "unknown",
    );
    assert.equal(
      classifyBookOutcome({
        error: {
          response: {
            status: 409,
            data: { Error: { ErrorCode: errorCode, ErrorMessage: "Review required" } },
          },
        },
      }).outcome,
      "unknown",
    );
  }
});

test("refunds never exceed what was paid and not yet refunded", () => {
  assert.equal(getRefundableAmount({ requested: 500, paid: 500 }), 500);
  assert.equal(getRefundableAmount({ requested: 450.456, paid: 500 }), 450.46);
  assert.equal(getRefundableAmount({ requested: 400, paid: 500, alreadyRefunded: 300 }), 200);
  assert.equal(getRefundableAmount({ requested: 400, paid: 500, alreadyRefunded: 500 }), 0);
  assert.equal(getRefundableAmount({ requested: -5, paid: 500 }), 0);
  assert.equal(getRefundableAmount({ requested: "abc", paid: 500 }), 0);
});

test("cancellation status becomes refundable only after the provider refund is final", () => {
  assert.deepEqual(classifyCancellationEntry({
    Status: "CANCELLED",
    RefundStatus: "MANUAL_PENDING",
  }), { localStatus: "succeeded", terminal: false, refundReady: false });
  assert.deepEqual(classifyCancellationEntry({
    Status: "CANCELLED",
    RefundStatus: "REFUNDED",
  }), { localStatus: "succeeded", terminal: true, refundReady: true });
  assert.deepEqual(classifyCancellationEntry({
    Status: "FAILED",
    RefundStatus: "REJECTED",
  }), { localStatus: "failed", terminal: true });
  assert.equal(classifyCancellationEntry({ Status: "IN_PROCESS" }).localStatus, "processing");
});
