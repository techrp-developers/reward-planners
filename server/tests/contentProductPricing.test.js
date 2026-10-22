const { test } = require('node:test');
const assert = require('node:assert/strict');
const entry = { content_id: 1, module: 'product', zone: 'offers_banner', target_type: 'category', target_id: 3 };
let writes = [];
const dbPath = require.resolve('../config/database');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  async query(sql, params) {
    if (sql.includes('FROM content_zone_entries')) return [[entry]];
    if (sql.includes('FROM content_zone_entry_images')) return [[{ target_type: 'product', target_ids: '[7,8]' }, { target_type: 'subcategory', target_id: 4 }]];
    if (sql.includes('SELECT p.product_id, p.product_name, p.brand_name,')) {
      assert.match(sql, /p.category_id = \?/);
      assert.match(sql, /p.subcategory_id = \?/);
      assert.deepEqual(params, [1, 3, 7, 8, 4]);
      return [[{ product_id: 7, variant_id: 12, sale_price: 100 }]];
    }
    if (sql.includes('INSERT INTO content_product_offers') || sql.includes('DELETE FROM content_product_offers')) {
      writes.push({ sql, params }); return [{}];
    }
    throw new Error('Unexpected query');
  },
} };
const model = require('../models/contentZoneModel');

test('pricing includes category, subcategory and image products; saves and clears campaign-only prices', async () => {
  await model.saveVariantPrice(1, 12, 75.50);
  assert.deepEqual(writes[0].params, [1, 7, 12, 75.50]);
  await model.saveVariantPrice(1, 12, null);
  assert.deepEqual(writes[1].params, [1, 12]);
  assert.ok(writes.every(write => !write.sql.includes('campaign_items')));
  await assert.rejects(model.saveVariantPrice(1, 999, 50), /not linked/);
  for (const invalid of [0, -1, Infinity, undefined, 'abc']) {
    await assert.rejects(model.saveVariantPrice(1, 12, invalid), /positive offer price/);
  }
  assert.equal(writes.length, 2);
  entry.module = 'service';
  await assert.rejects(model.getPricingVariants(1), /ecommerce banner/);
});
