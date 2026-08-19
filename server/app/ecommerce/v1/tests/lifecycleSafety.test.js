const test = require("node:test");
const assert = require("node:assert/strict");
const {
  acceptsFirstPaymentCapture,
  vendorStatusForShipment,
  canRequestCancellation,
  canCancelShipment,
} = require("../utils/lifecyclePolicy");
const {
  makeRefundKey,
} = require("../../../../services/Razorpay/refundKey");

test("only a pending-payment order accepts its first capture", () => {
  assert.equal(acceptsFirstPaymentCapture("pending_payment"), true);
  for (const status of [
    "paid",
    "processing",
    "partially_shipped",
    "shipped",
    "delivered",
    "rto",
    "delivery_failed",
    "cancelled",
  ]) {
    assert.equal(acceptsFirstPaymentCapture(status), false);
  }
});

test("vendor status follows shipment progression", () => {
  assert.equal(vendorStatusForShipment("booked"), "processing");
  assert.equal(vendorStatusForShipment("picked_up"), "shipped");
  assert.equal(vendorStatusForShipment("in_transit"), "shipped");
  assert.equal(vendorStatusForShipment("out_for_delivery"), "shipped");
  assert.equal(vendorStatusForShipment("delivered"), "delivered");
  assert.equal(vendorStatusForShipment("rto"), "cancelled");
});

test("cancellation is limited to pre-shipment paid orders", () => {
  assert.equal(canRequestCancellation("paid"), true);
  assert.equal(canRequestCancellation("processing"), true);
  assert.equal(canRequestCancellation("shipped"), false);
  assert.equal(canRequestCancellation("delivered"), false);
  assert.equal(canRequestCancellation("pending_payment"), false);
});

test("shipment cancellation is hidden after dispatch or termination", () => {
  assert.equal(canCancelShipment("booked"), true);
  assert.equal(canCancelShipment("in_transit"), false);
  assert.equal(canCancelShipment("delivered"), false);
  assert.equal(canCancelShipment("cancelled"), false);
});

test("refund keys are deterministic and scoped", () => {
  assert.equal(
    makeRefundKey({ orderId: 12 }),
    "order_12_cancel_refund",
  );
  assert.equal(
    makeRefundKey({ orderId: 12, shipmentId: 34 }),
    "shipment_34_rto_refund",
  );
  assert.equal(
    makeRefundKey({ orderId: 12, paymentId: 56 }),
    "payment_56_duplicate_refund",
  );
  assert.equal(
    makeRefundKey({ orderId: 12, refundKey: "custom_refund_key" }),
    "custom_refund_key",
  );
});
