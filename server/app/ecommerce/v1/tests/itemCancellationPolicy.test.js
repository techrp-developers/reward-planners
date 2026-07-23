const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canRequestItemCancellation,
  calculateItemRefund,
} = require("../utils/itemCancellationPolicy");

test("item cancellation is allowed only before courier booking", () => {
  const base = { fulfillmentStatus: "active", paymentStatus: "paid" };
  assert.equal(
    canRequestItemCancellation({ ...base, shipmentStatus: "pending" }),
    true,
  );
  assert.equal(
    canRequestItemCancellation({ ...base, shipmentStatus: "booked" }),
    false,
  );
  assert.equal(
    canRequestItemCancellation({
      ...base,
      fulfillmentStatus: "cancelled",
      shipmentStatus: "pending",
    }),
    false,
  );
});

test("shipping is refunded only for the last active item in a shipment", () => {
  assert.deepEqual(
    calculateItemRefund({
      finalPrice: 70,
      rewardCoinsUsed: 30,
      shippingCharge: 20,
      isLastActiveShipmentItem: false,
    }),
    { original: 70, wallet: 30, shipping: 0, total: 100 },
  );
  assert.deepEqual(
    calculateItemRefund({
      finalPrice: 70,
      rewardCoinsUsed: 30,
      shippingCharge: 20,
      isLastActiveShipmentItem: true,
    }),
    { original: 90, wallet: 30, shipping: 20, total: 120 },
  );
});
