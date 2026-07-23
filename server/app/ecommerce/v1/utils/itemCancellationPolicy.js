const PRE_BOOKING_SHIPMENT_STATUSES = [
  "awaiting_payment",
  "pending",
  "booking_failed",
];

function canRequestItemCancellation({
  fulfillmentStatus,
  shipmentStatus,
  paymentStatus,
}) {
  return (
    fulfillmentStatus === "active" &&
    ["paid", "processing"].includes(paymentStatus) &&
    PRE_BOOKING_SHIPMENT_STATUSES.includes(shipmentStatus)
  );
}

function calculateItemRefund({
  finalPrice,
  rewardCoinsUsed,
  shippingCharge = 0,
  isLastActiveShipmentItem = false,
}) {
  const money = Math.max(0, Number(finalPrice || 0));
  const wallet = Math.max(0, Number(rewardCoinsUsed || 0));
  const shipping = isLastActiveShipmentItem
    ? Math.max(0, Number(shippingCharge || 0))
    : 0;

  return {
    original: money + shipping,
    wallet,
    shipping,
    total: money + shipping + wallet,
  };
}

module.exports = {
  PRE_BOOKING_SHIPMENT_STATUSES,
  canRequestItemCancellation,
  calculateItemRefund,
};
