const { test } = require('node:test');
const assert = require('node:assert/strict');
const { orderOffer, orderOfferColumns } = require('../utils/orderOffer');

test('a line sold at the normal price has no offer', () => {
  assert.equal(orderOffer({ flash_sale_campaign_id: null, promotional_content_id: null, original_price: 200 }, 200), null);
});

test('flash sale lines report the campaign and total savings', () => {
  const offer = orderOffer({ flash_sale_campaign_id: 6, flash_sale_title: 'Diwali', original_price: '200.00' }, '150.00', 2);
  assert.deepEqual(offer, { type: 'flash_sale', title: 'Diwali', campaign_id: 6, content_id: null, original_price: 200, savings: 100 });
});

test('banner lines report the content and fall back to a default title', () => {
  const offer = orderOffer({ promotional_content_id: 7, original_price: 200 }, 150);
  assert.equal(offer.type, 'promotional_offer');
  assert.equal(offer.title, 'Promotional offer');
  assert.equal(offer.content_id, 7);
  assert.equal(offer.savings, 50);
});

test('orders from before the normal price was recorded still show the offer', () => {
  const offer = orderOffer({ flash_sale_campaign_id: 6, original_price: null }, 150, 3);
  assert.equal(offer.original_price, null);
  assert.equal(offer.savings, 0);
  assert.equal(offer.title, 'Flash Sale');
});

test('offer columns read from the given table alias', () => {
  assert.match(orderOfferColumns('so'), /so\.flash_sale_campaign_id/);
  assert.match(orderOfferColumns('so'), /oc\.campaign_id = so\.flash_sale_campaign_id/);
});
