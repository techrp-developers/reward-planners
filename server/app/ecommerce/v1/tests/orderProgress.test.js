const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deriveOrderProgress,
} = require("../utils/orderProgress");

test("a parent order is delivered only when every shipment is delivered", () => {
  assert.deepEqual(
    deriveOrderProgress(["delivered", "delivered"]),
    {
      currentStep: 3,
      status: "delivered",
      isPartial: false,
      deliveredShipments: 2,
      totalShipments: 2,
    },
  );

  assert.deepEqual(
    deriveOrderProgress(["delivered", "in_transit"]),
    {
      currentStep: 1,
      status: "partially_delivered",
      isPartial: true,
      deliveredShipments: 1,
      totalShipments: 2,
    },
  );
});

test("parent progress follows the least advanced active shipment", () => {
  const progress = deriveOrderProgress([
    "out_for_delivery",
    "in_transit",
  ]);

  assert.equal(progress.currentStep, 1);
  assert.equal(progress.status, "shipped");
  assert.equal(progress.isPartial, false);
});

test("shipment exceptions are exposed without marking the parent delivered", () => {
  assert.equal(
    deriveOrderProgress(["delivered", "ndr"]).status,
    "partially_delivered",
  );
  assert.equal(deriveOrderProgress(["in_transit", "rto"]).status, "rto");
  assert.equal(
    deriveOrderProgress(["delivered", "cancelled"]).status,
    "partially_delivered",
  );
});
