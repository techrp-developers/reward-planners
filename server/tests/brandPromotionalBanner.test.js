const { test } = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../config/database');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
const model = require('../models/contentZoneModel');
const controller = require('../controllers/contentController');
const base = { zone: 'brand_promotional_banner', content_type: 'image', title: 'Brand campaign' };

test('brand zone accepts all modules and display modes; existing zone validation remains intact', () => {
  for (const module of ['product', 'service', 'payment', 'dineout', 'mobile_dashboard']) {
    for (const display_mode of ['single', 'carousel', 'grid_2', 'grid_3']) {
      assert.doesNotThrow(() => model.validateEntry({ ...base, module, display_mode }));
    }
  }
  assert.throws(() => model.validateEntry({ ...base, module: 'product', display_mode: 'invalid' }), /Invalid display_mode/);
  assert.throws(() => model.validateEntry({ ...base, module: 'product', zone: 'promotional_banner' }), /image_url is required/);
  assert.doesNotThrow(() => model.validateEntry({ ...base, module: 'product', zone: 'offers_banner' }));
  assert.doesNotThrow(() => model.validateEntry({ ...base, module: 'product', content_type: 'color', color_value: '#852BAF' }));
});

test('resolution keeps four independent zones scoped to the requested module', async () => {
  const original = model.resolveActiveEntry;
  const calls = [];
  model.resolveActiveEntry = async (module, zone, options) => { calls.push([module, zone, options]); return null; };
  try {
    const result = await model.resolveAllZones('service');
    assert.deepEqual(Object.keys(result), ['navbar_background', 'promotional_banner', 'offers_banner', 'brand_promotional_banner']);
    assert.ok(calls.every(([module]) => module === 'service'));
    assert.equal(calls[3][2].allowDefaultFallback, false);
  } finally { model.resolveActiveEntry = original; }
});

test('admin can manage inactive brand images while resolved API hides them and primary fallback', async () => {
  const original = { getEntryById: model.getEntryById, getAllImagesByContentId: model.getAllImagesByContentId, resolveAllZones: model.resolveAllZones };
  const entry = { ...base, content_id: 1, module: 'product', image_url: 'brand.png' };
  model.getEntryById = async () => entry;
  model.getAllImagesByContentId = async () => [{ image_id: 1, image_url: 'brand.png', sort_order: 0, is_active: 0 }];
  model.resolveAllZones = async () => ({ brand_promotional_banner: entry });
  const response = () => ({ json(payload) { this.payload = payload; return this; }, status(code) { this.code = code; return this; } });
  try {
    const admin = response(); await controller.getEntry({ params: { id: 1 } }, admin);
    assert.equal(admin.payload.data.images[0].is_active, 0);
    const publicResponse = response(); await controller.getResolvedZones({ params: { module: 'product' } }, publicResponse);
    assert.deepEqual(publicResponse.payload.data.brand_promotional_banner.images, []);
    assert.equal(publicResponse.payload.data.brand_promotional_banner.image_url, null);
  } finally { Object.assign(model, original); }
});
