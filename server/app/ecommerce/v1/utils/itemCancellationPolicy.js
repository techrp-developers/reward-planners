const PRE_BOOKING_SHIPMENT_STATUSES = [
  "awaiting_payment",
  "pending",
  "booking_failed",
];
const SINGLE_ITEM_COURIER_CANCELLABLE_STATUSES = [
  "booked",
  "pickup_scheduled",
];

function canRequestItemCancellation({
  fulfillmentStatus,
  shipmentStatus,
  paymentStatus,
  activeShipmentItemCount = 1,
}) {
  return (
    fulfillmentStatus === "active" &&
    ["paid", "processing"].includes(paymentStatus) &&
    (
      PRE_BOOKING_SHIPMENT_STATUSES.includes(shipmentStatus) ||
      (
        Number(activeShipmentItemCount) === 1 &&
        SINGLE_ITEM_COURIER_CANCELLABLE_STATUSES.includes(shipmentStatus)
      )
    )
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
  SINGLE_ITEM_COURIER_CANCELLABLE_STATUSES,
  canRequestItemCancellation,
  calculateItemRefund,
};
