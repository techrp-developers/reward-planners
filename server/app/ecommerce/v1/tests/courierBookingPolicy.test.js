const test = require("node:test");
const assert = require("node:assert/strict");
const {
  shouldSkipCourierBooking,
} = require("../utils/courierBookingPolicy");

test("courier test mode is restricted to explicitly allowlisted users", () => {
  assert.equal(
    shouldSkipCourierBooking({
      userId: 24,
      enabled: "true",
      allowedUserIds: "24,61",
    }),
    true,
  );
  assert.equal(
    shouldSkipCourierBooking({
      userId: 3,
      enabled: "true",
      allowedUserIds: "24,61",
    }),
    false,
  );
  assert.equal(
    shouldSkipCourierBooking({
      userId: 24,
      enabled: "false",
      allowedUserIds: "24",
    }),
    false,
  );
});
