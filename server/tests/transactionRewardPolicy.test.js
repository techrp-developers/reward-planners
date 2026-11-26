const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSettings, rewardForAmount } = require("../services/rewards/transactionRewardPolicy");

test("ranges include minimum, exclude maximum, allow an unlimited final range", () => {
  const { ranges } = validateSettings({ expiry_days: 90, ranges: [
    { min: 500, max: null, points: 25 }, { min: 100, max: 500, points: 10 },
  ] });
  for (const [amount, expected] of [[0, 0], [99.99, 0], [100, 10], [499.99, 10], [500, 25], [9999, 25], [-1, 0], [NaN, 0]]) {
    assert.equal(rewardForAmount(ranges, amount), expected);
  }
});

test("rejects overlapping ranges and multiple unlimited ranges", () => {
  for (const ranges of [
    [{ min: 100, max: 600, points: 1 }, { min: 500, max: 700, points: 2 }],
    [{ min: 100, max: null, points: 1 }, { min: 500, max: null, points: 2 }],
  ]) assert.throws(() => validateSettings({ ranges, expiry_days: 90 }), /overlap/);
});

test("validates points, amount precision, expiry, and missing inputs", () => {
  for (const row of [
    { min: -1, max: 500, points: 1 }, { min: 1.001, max: 500, points: 1 },
    { min: 100, max: 100, points: 1 }, { min: 100, max: 500, points: 0 },
    { min: 100, max: 500, points: 1.5 }, { min: "", max: 500, points: 1 },
    { min: 100, max: 500, points: 1000001 },
  ]) assert.throws(() => validateSettings({ ranges: [row], expiry_days: 90 }));
  for (const expiry_days of [0, 1.5, 3651, "oops"]) assert.throws(() => validateSettings({ ranges: [], expiry_days }));
  assert.deepEqual(validateSettings({ ranges: [], expiry_days: 90 }), { ranges: [], expiry_days: 90 });
});
