const { test } = require('node:test');
const assert = require('node:assert/strict');
let flashSales = [];
let saved;
const dbPath = require.resolve('../config/database');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  async query(sql, params) {
    if (sql.includes('UPDATE campaign_items')) { saved = params; return [{}]; }
    if (sql.includes('FROM product_variants')) return [[{ sale_price: 100, stock: 10 }]];
    if (sql.includes('FROM campaign_items')) {
      if (sql.includes("campaign_type = 'flash_sale'")) {
        assert.match(sql, /ep\.is_deleted = 0/);
        assert.match(sql, /ci\.max_qty > COALESCE\(ci\.sold_qty, 0\)/);
        assert.match(sql, /pv\.stock > 0/);
        assert.match(sql, /ci\.offer_price > 0/);
        return [flashSales];
      }
      return [[{ id: 1 }]];
    }
    if (sql.includes('WHERE campaign_id = ?')) return [[{ campaign_id: 1, campaign_type: 'flash_sale' }]];
    return [[]];
  },
} };
const model = require('../models/campaignModel');

test('custom prices can exceed normal sale price; invalid prices and quantities are rejected', async () => {
  await model.updateCampaignItem(1, 2, 125.50, 5);
  assert.deepEqual(saved, [125.50, 5, 1, 2]);
  for (const price of [0, -1, Infinity, 'invalid']) {
    await assert.rejects(model.updateCampaignItem(1, 2, price, 5), /positive number/);
  }
  for (const quantity of [0, 1.5, 11]) {
    await assert.rejects(model.updateCampaignItem(1, 2, 50, quantity), /whole number/);
  }
});

test('home flag hides empty flash sales and shows campaigns with eligible offers', async () => {
  let result = await model.getHomeCampaigns();
  assert.equal(result.show_flash_sale, false);
  assert.deepEqual(result.flash_sales, []);
  flashSales = [{ campaign_id: 1, title: 'Sale' }];
  result = await model.getHomeCampaigns();
  assert.equal(result.show_flash_sale, true);
  assert.equal(result.flash_sales.length, 1);
});
