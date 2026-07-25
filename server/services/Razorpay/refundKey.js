function makeRefundKey({ orderId, shipmentId, paymentId, refundKey }) {
  if (refundKey) return refundKey;
  if (shipmentId) return `shipment_${shipmentId}_rto_refund`;
  if (paymentId) return `payment_${paymentId}_duplicate_refund`;
  return `order_${orderId}_cancel_refund`;
}

module.exports = { makeRefundKey };
