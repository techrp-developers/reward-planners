const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeIndianMobile } = require("../phone");

test("normalizes valid Indian mobile numbers", () => {
  assert.equal(normalizeIndianMobile("9673733888"), "+919673733888");
  assert.equal(normalizeIndianMobile("+91 96737 33888"), "+919673733888");
  assert.equal(normalizeIndianMobile("09673733888"), "+919673733888");
});

test("rejects malformed Indian mobile numbers", () => {
  assert.equal(normalizeIndianMobile("89795280925"), null);
  assert.equal(normalizeIndianMobile("1234567890"), null);
  assert.equal(normalizeIndianMobile(""), null);
});
