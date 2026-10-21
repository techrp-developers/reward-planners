const { test } = require('node:test');
const assert = require('node:assert/strict');
const entry = { content_id: 1, module: 'product', zone: 'offers_banner', content_type: 'image', is_published: 1, target_type: 'product', target_id: 99, target_ids: [99] };
const images = [
  { image_id: 10, content_id: 1, is_active: 1, image_url: 'a.png', sort_order: 0 },
  { image_id: 11, content_id: 1, is_active: 1, image_url: 'b.png', sort_order: 1 },
  { image_id: 12, content_id: 2, is_active: 1 },
  { image_id: 13, content_id: 1, is_active: 0 },
];
let productParams;
const dbPath = require.resolve('../config/database');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  async query(sql, params) {
    if (sql.includes('UPDATE content_zone_entry_images')) {
      Object.assign(images.find(image => image.image_id === Number(params[4])), { target_type: params[0], target_id: params[1], target_ids: params[2] });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM content_zone_entry_images')) return [sql.includes('WHERE image_id') ? images.filter(image => image.image_id === Number(params[0])) : images.filter(image => image.content_id === 1 && image.is_active)];
    if (sql.includes('FROM content_zone_entries')) return [[entry]];
    if (sql.includes('ORDER BY FIELD(p.product_id')) { productParams = params; return [[]]; }
    if (sql.includes('AS label')) return [[{ id: 20 }, { id: 21 }, { id: 22 }]];
    throw new Error('Unexpected query');
  },
} };
const model = require('../models/contentZoneModel');
const cms = require('../app/common/controller/cmsController');
const icons = require('../models/moduleIconModel');

test('images save independent selections, expose navigation, and scope offer queries', async () => {
  await model.updateImageTarget(1, 10, { target_type: 'product', target_ids: [20] });
  await model.updateImageTarget(1, 11, { target_type: 'product', target_ids: [21, 22] });
  assert.equal((await model.getImageTargetEntry(1, 10)).target_id, 20);
  assert.deepEqual(JSON.parse((await model.getImageTargetEntry(1, 11)).target_ids), [21, 22]);
  await model.getContentProducts(1, 11);
  assert.deepEqual(productParams, [1, 21, 22, 21, 22]);
  const originalResolve = model.resolveAllZones;
  const originalIcons = icons.getActiveModules;
  model.resolveAllZones = async () => ({ offers_banner: entry });
  icons.getActiveModules = async () => [];
  try {
    const res = { json(payload) { this.payload = payload; return this; }, status() { return this; } };
    await cms.getMobileContent({ query: { module: 'product' } }, res);
    const result = res.payload.data.content.product.offers_banner.images;
    assert.deepEqual(result[0].navigation, { destination: 'product_details', targetId: 20, contentId: 1, imageId: 10 });
    assert.deepEqual(result[1].navigation, { destination: 'product_offer', targetIds: [21, 22], contentId: 1, imageId: 11 });
  } finally { model.resolveAllZones = originalResolve; icons.getActiveModules = originalIcons; }
  await model.updateImageTarget(1, 10, { target_type: '' });
  assert.equal((await model.getImageTargetEntry(1, 10)).target_id, 99);
  await assert.rejects(model.updateImageTarget(1, 12, { target_type: '' }), /not found/);
  await assert.rejects(model.getImageTargetEntry(1, 12), /not found/);
  await assert.rejects(model.getImageTargetEntry(1, 13), /not found/);
  await assert.rejects(model.updateImageTarget(1, 10, { target_type: 'product', target_ids: [999] }), /no longer exists/);
});
