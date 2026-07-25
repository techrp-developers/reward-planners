const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getCancellationGraceMinutes,
  getCourierBookingEligibleAt,
  isCourierBookingGraceActive,
} = require("../utils/bookingGracePolicy");

test("courier booking waits through the cancellation grace period", () => {
  const paidAt = new Date("2026-07-24T10:00:00.000Z");
  assert.equal(getCancellationGraceMinutes("15"), 15);
  assert.equal(
    getCourierBookingEligibleAt(paidAt, 10).toISOString(),
    "2026-07-24T10:10:00.000Z",
  );
  assert.equal(
    isCourierBookingGraceActive({
      paidAt,
      graceMinutes: 10,
      now: new Date("2026-07-24T10:09:59.000Z"),
    }),
    true,
  );
  assert.equal(
    isCourierBookingGraceActive({
      paidAt,
      graceMinutes: 10,
      now: new Date("2026-07-24T10:10:00.000Z"),
    }),
    false,
  );
});
