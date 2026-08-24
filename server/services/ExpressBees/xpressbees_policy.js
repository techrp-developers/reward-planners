const XPRESS_ORDER_NUMBER_MAX_LENGTH = 20;

const XPRESS_STATUS_CODE_MAP = {
  PP: "booked",
  IT: "in_transit",
  EX: "ndr",
  FD: "out_for_delivery",
  DL: "delivered",
  RT: "rto",
  "RT-IT": "rto",
  "RT-DL": "rto",
};

function buildXpressOrderNumber(orderReference, vendorId) {
  const suffix = `-V${vendorId}`;
  const availableReferenceLength = Math.max(
    1,
    XPRESS_ORDER_NUMBER_MAX_LENGTH - suffix.length,
  );
  const reference = String(orderReference || "ORDER")
    .replace(/\s+/g, "-")
    .slice(0, availableReferenceLength);

  return `${reference}${suffix}`;
}

function mapXpressStatusCode(statusCode) {
  if (!statusCode) return null;
  return XPRESS_STATUS_CODE_MAP[String(statusCode).trim().toUpperCase()] || null;
}

function isXpressRtoDelivered(statusCode, status) {
  const normalizedCode = String(statusCode || "").trim().toUpperCase();
  if (normalizedCode === "RT-DL") return true;

  const normalizedStatus = String(status || "").trim().toLowerCase();
  return normalizedStatus === "rto delivered" || normalizedStatus === "return delivered";
}

module.exports = {
  XPRESS_ORDER_NUMBER_MAX_LENGTH,
  buildXpressOrderNumber,
  isXpressRtoDelivered,
  mapXpressStatusCode,
};
