const test = require("node:test");
const assert = require("node:assert/strict");
const {
  XPRESS_ORDER_NUMBER_MAX_LENGTH,
  buildXpressOrderNumber,
  isXpressRtoDelivered,
  mapXpressStatusCode,
} = require("../../../../services/ExpressBees/xpressbees_policy");

test("XpressBees order numbers stay within the provider limit", () => {
  const result = buildXpressOrderNumber("REWARD-ORDER-REFERENCE-123456", 987);

  assert.equal(result.length <= XPRESS_ORDER_NUMBER_MAX_LENGTH, true);
  assert.equal(result.endsWith("-V987"), true);
});

test("XpressBees tracking codes map independently of display messages", () => {
  assert.equal(mapXpressStatusCode("PP"), "booked");
  assert.equal(mapXpressStatusCode("IT"), "in_transit");
  assert.equal(mapXpressStatusCode("EX"), "ndr");
  assert.equal(mapXpressStatusCode("FD"), "out_for_delivery");
  assert.equal(mapXpressStatusCode("DL"), "delivered");
  assert.equal(mapXpressStatusCode("RT-IT"), "rto");
});

test("RTO processing waits until the parcel is returned", () => {
  assert.equal(isXpressRtoDelivered("RT", "rto"), false);
  assert.equal(isXpressRtoDelivered("RT-IT", "rto in transit"), false);
  assert.equal(isXpressRtoDelivered("RT-DL", "shipment delivered"), true);
});
