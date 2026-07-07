// Maps a transaction's internal bbps_status + its refund status (if any) to
// the mobile-facing final_status enum. Shared by checkStatus and
// getOrderHistory so both endpoints agree on what "refunded"/"retrying"/etc.
// mean for the same transaction.
const mapFinalStatus = (bbpsStatus, refundStatus) => {
  if (bbpsStatus === "PAID") return "SUCCESS";
  if (refundStatus === "completed") return "REFUNDED";
  if (["pending", "processing", "failed"].includes(refundStatus)) {
    return "REFUND_PENDING";
  }
  if (refundStatus === "manual_review" || bbpsStatus === "RECONCILIATION_REQUIRED") {
    return "RECONCILIATION_REQUIRED";
  }
  if (bbpsStatus === "FAILED_FINAL" || bbpsStatus === "PAYMENT_FAILED") {
    return "FAILED";
  }
  if (bbpsStatus === "FAILED_RETRY") return "RETRYING";
  return "PENDING";
};

module.exports = { mapFinalStatus };
