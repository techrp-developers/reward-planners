const { test } = require('node:test');
const assert = require('node:assert/strict');

let inserted;
let saved;
let variants = [];
const dbPath = require.resolve('../config/database');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  async query(sql, params) {
    if (sql.includes('INSERT IGNORE')) { inserted = { sql, rows: params[0] }; return [{}]; }
    if (sql.includes('UPDATE campaign_service_items')) { saved = params; return [{}]; }
    if (sql.includes('SELECT price FROM service_variants')) return [[{ price: 100 }]];
    if (sql.includes('FROM campaign_service_items') && sql.includes('LIMIT 1')) return [[{ id: 1 }]];
    if (sql.includes('FROM services s') || sql.includes('FROM eproducts ep')) return [variants];
    if (sql.includes('WHERE campaign_id = ?')) return [[{ campaign_id: 1, campaign_type: 'flash_sale', module: params[0] === 2 ? 'service' : 'product' }]];
    return [[]];
  },
} };

const model = require('../models/campaignModel');
const { campaignNavigation } = require('../utils/contentNavigation');

test('poster navigation covers each destination', () => {
  const base = { campaign_id: 7 };
  assert.equal(campaignNavigation({ ...base, redirect_type: null }), null);
  assert.deepEqual(
    campaignNavigation({ ...base, redirect_type: 'category', redirect_id: 3 }),
    { destination: 'category', targetId: 3, campaignId: 7 },
  );
  assert.deepEqual(
    campaignNavigation({ ...base, redirect_type: 'product', redirect_id: 4, redirect_ids: '[4]' }),
    { destination: 'product_details', targetId: 4, campaignId: 7 },
  );
  assert.deepEqual(
    campaignNavigation({ ...base, redirect_type: 'service', redirect_id: 4, redirect_ids: '[4,5]' }),
    { destination: 'service_offer', targetIds: [4, 5], campaignId: 7 },
  );
  assert.deepEqual(
    campaignNavigation({ ...base, redirect_type: 'external_url', redirect_url: 'https://example.com' }),
    { destination: 'external_url', url: 'https://example.com' },
  );
});

test('bulk add prices each variant and caps quantity at stock', async () => {
  variants = [
    { product_id: 1, variant_id: 10, sale_price: 200, stock: 3 },
    { product_id: 1, variant_id: 11, sale_price: 99.99, stock: 50 },
  ];
  const result = await model.bulkAddCampaignItems(1, { target_type: 'category', target_ids: [9], discount_percent: 25, max_qty: 5 });
  assert.equal(result.added, 2);
  assert.match(inserted.sql, /campaign_items/);
  assert.deepEqual(inserted.rows, [[1, 1, 10, 150, 3], [1, 1, 11, 74.99, 5]]);
});

test('service flash sale bulk add writes service items without a quantity', async () => {
  variants = [{ product_id: 5, variant_id: 20, sale_price: 1000, stock: null }];
  await model.bulkAddCampaignItems(2, { target_type: 'service_category', target_ids: [1], discount_percent: 10 });
  assert.match(inserted.sql, /campaign_service_items/);
  assert.deepEqual(inserted.rows, [[2, 5, 20, 900]]);
});

test('bulk add rejects targets from the other module and invalid discounts', async () => {
  await assert.rejects(model.bulkAddCampaignItems(2, { target_type: 'category', target_ids: [1], discount_percent: 10 }), /Invalid target type/);
  await assert.rejects(model.bulkAddCampaignItems(1, { target_type: 'service', target_ids: [1], discount_percent: 10 }), /Invalid target type/);
  for (const discount of [0, 100, -5, 'x']) {
    await assert.rejects(model.bulkAddCampaignItems(1, { target_type: 'category', target_ids: [1], discount_percent: discount }), /Discount/);
  }
});

test('service offer must stay below the normal price, since the cheapest live offer is charged', async () => {
  await model.updateCampaignItem(2, 20, 80);
  assert.deepEqual(saved, [80, 2, 20]);
  for (const price of [100, 120]) {
    await assert.rejects(model.updateCampaignItem(2, 20, price), /below the normal price/);
  }
  await assert.rejects(model.updateCampaignItem(2, 20, 0), /positive number/);
});
