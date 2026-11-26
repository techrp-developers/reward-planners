const DEFAULT_BLOCK_TTL_MINUTES = 8;

function getBookingDecision(order) {
  if (!order) return "not_found";
  if (order.status === "confirmed" && order.provider_booking_id) {
    return "already_confirmed";
  }
  if (order.status === "booking_in_progress") return "in_progress";
  if (order.status === "booking_review") return "under_review";
  if (order.status === "booking_failed") return "failed";
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

// How long the provider holds blocked seats. A payment may only be started
// inside this window; anything captured later is booked-or-refunded.
function getBlockTtlMinutes(env = process.env) {
  const configured = Number(env.BUS_BLOCK_TTL_MINUTES);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_BLOCK_TTL_MINUTES;
}

function isBlockExpired(ageSeconds, ttlMinutes) {
  return Number(ageSeconds) >= Number(ttlMinutes) * 60;
}

// A provider call whose result cannot be known: no response at all (timeout,
// connection reset) or a response that says nothing about the request itself.
function isAmbiguousProviderError(error) {
  const status = Number(error?.response?.status);
  if (!status) return true;
  return status >= 500 || status === 408 || status === 429;
}

const AMBIGUOUS_BOOK_ERROR_CODES = new Set([7031, 7033]);

function getProviderErrorCode(payload) {
  const value = Number(payload?.Error?.ErrorCode);
  return Number.isFinite(value) ? value : 0;
}

// Money is only refunded on a "failed" outcome, so anything that could still
// have produced a ticket must be classified "unknown" and reviewed instead.
function classifyBookOutcome({ data, error }) {
  if (error) {
    const errorCode = getProviderErrorCode(error.response?.data);
    if (AMBIGUOUS_BOOK_ERROR_CODES.has(errorCode)) {
      return {
        outcome: "unknown",
        errorCode,
        message:
          String(error.response?.data?.Error?.ErrorMessage || "").trim() ||
          "Book request requires provider review",
      };
    }
    if (isAmbiguousProviderError(error)) {
      return { outcome: "unknown", message: "Book request outcome is unknown" };
    }
    return {
      outcome: "failed",
      message:
        String(error.response?.data?.Error?.ErrorMessage || "").trim() ||
        `Provider rejected the book request (HTTP ${error.response.status})`,
    };
  }

  const errorCode = getProviderErrorCode(data);
  if (errorCode !== 0) {
    if (AMBIGUOUS_BOOK_ERROR_CODES.has(errorCode)) {
      return {
        outcome: "unknown",
        errorCode,
        message:
          String(data?.Error?.ErrorMessage || "").trim() ||
          "Book request requires provider review",
      };
    }
    return {
      outcome: "failed",
      errorCode,
      message:
        String(data?.Error?.ErrorMessage || "").trim() ||
        "Unable to book bus ticket",
    };
  }

  const bookingId = data?.BookingId ?? null;
  const bookingStatus = data?.Result?.BusBookingStatus || null;

  if (bookingId && String(bookingStatus || "").toLowerCase() === "success") {
    return {
      outcome: "confirmed",
      bookingId: String(bookingId),
      bookingStatus,
      ticketNo: data?.Result?.TicketNo || null,
      travelOperatorPNR: data?.Result?.TravelOperatorPNR || null,
    };
  }

  return {
    outcome: "unknown",
    message: bookingId
      ? `Provider returned booking ${bookingId} with status ${bookingStatus || "missing"}`
      : "Provider returned neither an error nor a BookingId",
  };
}

function getRefundableAmount({ requested, paid, alreadyRefunded = 0 }) {
  const remaining = Number(paid) - Number(alreadyRefunded);
  const amount = Math.min(Number(requested), remaining);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Number(amount.toFixed(2));
}

function classifyCancellationEntry(entry) {
  const status = String(entry?.Status || "").trim().toUpperCase();
  const refundStatus = String(entry?.RefundStatus || "").trim().toUpperCase();

  if (status === "FAILED") return { localStatus: "failed", terminal: true };
  if (status === "CANCELLED") {
    return {
      localStatus: "succeeded",
      terminal: ["REFUNDED", "REJECTED"].includes(refundStatus),
      refundReady: refundStatus === "REFUNDED",
    };
  }
  return { localStatus: "processing", terminal: false, refundReady: false };
}

module.exports = {
  getBookingDecision,
  isExpectedCapturedPayment,
  getBlockTtlMinutes,
  isBlockExpired,
  isAmbiguousProviderError,
  classifyBookOutcome,
  classifyCancellationEntry,
  getRefundableAmount,
};
