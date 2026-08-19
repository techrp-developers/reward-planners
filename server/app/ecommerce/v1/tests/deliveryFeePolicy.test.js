const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deliveryChargeForUser,
} = require("../utils/deliveryFeePolicy");

test("free delivery test mode is restricted to allowlisted users", () => {
  assert.equal(
    deliveryChargeForUser({
      userId: 24,
      calculatedCharge: 49,
      enabled: "true",
      allowedUserIds: "24",
    }),
    0,
  );
  assert.equal(
    deliveryChargeForUser({
      userId: 3,
      calculatedCharge: 49,
      enabled: "true",
      allowedUserIds: "24",
    }),
    49,
  );
});
