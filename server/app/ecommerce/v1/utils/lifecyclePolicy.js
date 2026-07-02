function acceptsFirstPaymentCapture(orderStatus) {
  return orderStatus === "pending_payment";
}

function vendorStatusForShipment(shipmentStatus) {
  if (shipmentStatus === "delivered") return "delivered";
  if (["picked_up", "in_transit", "out_for_delivery"].includes(shipmentStatus)) {
    return "shipped";
  }
  if (["cancelled", "rto"].includes(shipmentStatus)) return "cancelled";
  return "processing";
}

function canRequestCancellation(orderStatus) {
  return ["paid", "processing"].includes(orderStatus);
}

module.exports = {
  acceptsFirstPaymentCapture,
  vendorStatusForShipment,
  canRequestCancellation,
};
