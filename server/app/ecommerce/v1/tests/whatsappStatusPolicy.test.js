const test = require("node:test");
const assert = require("node:assert/strict");
const {
  STATUS_EVENT_MAP,
} = require("../../../../services/whatsapp/ecommerceOrderStatusPolicy");

test("ecommerce shipment statuses map to distinct WhatsApp events", () => {
  assert.deepEqual(STATUS_EVENT_MAP, {
    out_for_delivery: "order_place_arriving",
    delivered: "order_place_delivered",
    cancelled: "cancel_order",
  });
  assert.equal(new Set(Object.values(STATUS_EVENT_MAP)).size, 3);
});
