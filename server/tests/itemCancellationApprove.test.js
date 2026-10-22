const { test } = require('node:test');
const assert = require('node:assert/strict');
function mock(path, exports) { const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports }; }
mock('../config/database', {});
mock('../services/rewards/ecommerceWalletService', { addWalletAdjustment: async () => false });
const model = require('../models/itemCancellationModel');

function connection({ shippingStatus, orderStatus = 'paid', orderRefund = false }) {
  const writes = [];
  return {
    writes,
    async execute(sql, params) {
      if (sql.includes('FROM ecommerce_item_cancellations ic')) {
        return [[{ cancellation_status: 'requested', fulfillment_status: 'cancellation_requested', order_item_id: 9, order_id: 3, vendor_order_id: 4, variant_id: 5, quantity: 1, final_price: 100, reward_coins_used: 0, user_id: 7, order_status: orderStatus, shipment_id: 6, shipping_status: shippingStatus, shipping_charges: 0 }]];
      }
      if (sql.includes('FROM order_refunds')) return [orderRefund ? [{ found: 1 }] : []];
      if (sql.includes('AS active_count')) return [[{ active_count: 1 }]];
      if (sql.includes('AS remaining')) return [[{ remaining: 0 }]];
      if (sql.includes('FROM order_payments')) return [[{ payment_id: 1 }]];
      writes.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
}

test('approves an item whose shipment is already cancelled without touching the shipment cancel record', async () => {
  const conn = connection({ shippingStatus: 'cancelled' });
  const refund = await model.approve(9, conn);
  assert.equal(refund.original, 100);
  assert.ok(conn.writes.some(w => w.sql.includes("fulfillment_status = 'cancelled'")));
  assert.ok(!conn.writes.some(w => w.sql.includes('UPDATE order_shipments')));
});

test('refuses when the whole order was already cancelled or refunded', async () => {
  await assert.rejects(model.approve(9, connection({ shippingStatus: 'cancelled', orderStatus: 'cancelled' })), /ORDER_ALREADY_CANCELLED/);
  await assert.rejects(model.approve(9, connection({ shippingStatus: 'cancelled', orderRefund: true })), /ORDER_ALREADY_CANCELLED/);
});

test('still refuses shipments already in transit', async () => {
  await assert.rejects(model.approve(9, connection({ shippingStatus: 'in_transit' })), /SHIPMENT_ALREADY_BOOKED/);
});
