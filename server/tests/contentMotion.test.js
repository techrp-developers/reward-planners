const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const rows = new Map();
let nextId;
const dbPath = require.resolve('../config/database');
const db = {
  async query(sql, params = []) {
    if (sql.includes('FROM content_zone_entry_images')) return [[]];
    if (sql.includes('INSERT INTO content_zone_entries')) {
      const columns = sql.match(/content_zone_entries\s*\(([^)]+)\)/)[1].split(',').map(value => value.trim());
      const tokens = sql.match(/VALUES\s*\(([^)]+)\)/)[1].split(',').map(value => value.trim());
      assert.equal(columns.length, tokens.length, 'SQL columns and values must match');
      let offset = 0;
      const row = { content_id: nextId++, created_at: '2026-10-05 00:00:00' };
      columns.forEach((column, index) => { row[column] = tokens[index] === '?' ? params[offset++] : Number(tokens[index]); });
      assert.equal(offset, params.length);
      rows.set(row.content_id, row);
      return [{ insertId: row.content_id }];
    }
    if (sql.includes('UPDATE content_zone_entries')) {
      const row = rows.get(Number(params.at(-1)));
      const columns = sql.match(/SET\s+([\s\S]+?)WHERE/)[1].split(',').map(value => value.split('=')[0].trim());
      columns.forEach((column, index) => { row[column] = params[index]; });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('COUNT(*)')) return [[{ total: rows.size }]];
    if (sql.includes('WHERE content_id = ?')) return [[rows.get(Number(params[0]))].filter(Boolean)];
    if (sql.includes('zone = ?')) return [[...rows.values()].filter(row => row.module === params[0] && row.zone === params[1] && (sql.includes('is_default = 1') ? row.is_default : row.is_published && !row.is_default))];
    return [[...rows.values()]];
  },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
const model = require('../models/contentZoneModel');
const controller = require('../controllers/contentController');
const mobileController = require('../app/common/controller/cmsController');
const moduleIcons = require('../models/moduleIconModel');
const base = { module: 'product', zone: 'promotional_banner', content_type: 'image', image_url: 'https://example.com/banner.jpg', title: 'Festival' };
const motion = { motionEffect: 'falling_petals', motionIntensity: 'high', motionSpeed: 'fast' };
const defaults = { motionEffect: 'none', motionIntensity: 'medium', motionSpeed: 'normal' };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } });
const assertMotion = (entry, expected) => {
  for (const [key, value] of Object.entries(expected)) assert.equal(entry[key], value);
};
beforeEach(() => { rows.clear(); nextId = 1; });

test('shared discount rules persist, duplicate, and can be disabled', async () => {
  const entry = await model.createEntry(base);
  assert.deepEqual(await model.getDiscountRule(entry.content_id), { discount_type: 'none', discount_value: 0 });
  await model.saveDiscountRule(entry.content_id, 'percentage', 10);
  const copy = await model.duplicateEntry(entry.content_id);
  assert.equal(copy.discount_type, 'percentage');
  assert.equal(copy.discount_value, 10);
  await model.saveDiscountRule(entry.content_id, 'none', 0);
  assert.deepEqual(await model.getDiscountRule(entry.content_id), { discount_type: 'none', discount_value: 0 });
  await assert.rejects(model.saveDiscountRule(entry.content_id, 'percentage', 101), /percentage/);
});

test('multiple services survive edits and duplication and expose offer navigation', async () => {
  const entry = await model.createEntry({ ...base, module: 'service', is_published: 1, target_type: 'service', target_id: 12, target_ids: [12, 13] });
  const copy = await model.duplicateEntry(entry.content_id);
  assert.deepEqual(JSON.parse(copy.target_ids), [12, 13]);
  await model.updateEntry(entry.content_id, { target_ids: [12, 14] });
  assert.deepEqual(JSON.parse((await model.getEntryById(entry.content_id)).target_ids), [12, 14]);
  const original = model.getContentServices;
  model.getContentServices = async () => [{ id: 12, service_image: null }, { id: 14, service_image: null }];
  try {
    const result = response();
    await mobileController.getContentServices({ params: { id: entry.content_id } }, result);
    assert.equal(result.code, 200);
    assert.deepEqual(result.payload.data.content.navigation, { destination: 'service_offer', targetIds: [12, 14], contentId: entry.content_id });
    assert.deepEqual(result.payload.data.services.map(service => service.id), [12, 14]);
    const draft = response();
    await mobileController.getContentServices({ params: { id: copy.content_id } }, draft);
    assert.equal(draft.code, 404);
  } finally { model.getContentServices = original; }
});

test('service destination lookup uses active service tables and rejects missing targets', async () => {
  const original = db.query;
  const tables = { service: 'services', service_category: 'service_categories', service_bundle: 'service_bundles' };
  try {
    for (const [type, table] of Object.entries(tables)) {
      db.query = async (sql, params) => {
        assert.ok(sql.includes(`FROM ${table} WHERE status = 1`));
        assert.deepEqual(params, ['%tax%', 12]);
        return [[{ id: '12', label: 'Tax assistance' }]];
      };
      assert.deepEqual(await model.getTargetOptions(type, 'tax', 12), [{ id: 12, label: 'Tax assistance', imageUrl: null }]);
      db.query = async () => [[]];
      await assert.rejects(model.validateTarget(type, 12), /no longer exists/);
    }
  } finally { db.query = original; }
});

test('mobile CMS exposes service destination type and ID', async () => {
  const original = moduleIcons.getActiveModules;
  moduleIcons.getActiveModules = async () => [];
  try {
    for (const [index, type] of ['service', 'service_category', 'service_bundle'].entries()) {
      const zone = ['promotional_banner', 'offers_banner', 'brand_promotional_banner'][index];
      await model.createEntry({ ...base, module: 'service', zone, is_published: 1, target_type: type, target_id: 12 });
      const mobile = response();
      await mobileController.getMobileContent({ query: { module: 'service' } }, mobile);
      const banner = mobile.payload.data.content.service[zone];
      assert.equal(banner.targetType, type);
      assert.equal(banner.targetId, 12);
    }
  } finally { moduleIcons.getActiveModules = original; }
});

test('service destinations persist, clear, and reject destinations from another module', async () => {
  for (const zone of ['promotional_banner', 'offers_banner', 'brand_promotional_banner']) {
    for (const type of ['service', 'service_category', 'service_bundle']) {
      const entry = await model.createEntry({ ...base, module: 'service', zone, target_type: type, target_id: 12 });
      const saved = await model.getEntryById(entry.content_id);
      assert.equal(saved.target_type, type);
      assert.equal(saved.target_id, 12);
      assert.throws(() => model.validateEntry({ ...base, target_type: type, target_id: 12 }), /service module/);
      await model.updateEntry(entry.content_id, { target_id: 13 });
      assert.equal((await model.getEntryById(entry.content_id)).target_id, 13);
      await assert.rejects(model.updateEntry(entry.content_id, { target_type: 'product', target_id: 13 }), /Choose a service/);
      await model.updateEntry(entry.content_id, { target_type: '' });
      assert.equal((await model.getEntryById(entry.content_id)).target_id, null);
    }
  }
});

test('offer and brand banners preserve destinations through create, update and mobile product lookup', async () => {
  const original = model.getContentProducts;
  const requested = [];
  model.getContentProducts = async (id) => { requested.push(id); return []; };
  try {
    for (const zone of ['offers_banner', 'brand_promotional_banner']) {
      const entry = await model.createEntry({ ...base, zone, is_published: 1, target_type: 'product', target_id: 42, target_ids: [42, 43] });
      const mobile = response();
      await mobileController.getContentProducts({ params: { id: entry.content_id } }, mobile);
      assert.equal(mobile.code, 200);
      assert.deepEqual(mobile.payload.data.content.targetIds, [42, 43]);
      for (const type of ['category', 'subcategory']) {
        await model.updateEntry(entry.content_id, { target_type: type, target_id: 7, target_ids: [] });
        const saved = await model.getEntryById(entry.content_id);
        assert.equal(saved.target_type, type);
        assert.equal(saved.target_id, 7);
      }
    }
    assert.equal(requested.length, 2);
  } finally { model.getContentProducts = original; }
});

test('clearing a target through the update endpoint stores SQL nulls', async () => {
  const entry = await model.createEntry({ ...base, target_type: 'product', target_id: 42, target_ids: [42] });
  const res = response();
  await controller.updateEntry({ params: { id: entry.content_id }, body: { target_type: '', target_id: '', target_ids: '' } }, res);
  assert.equal(res.code, 200);
  const saved = rows.get(entry.content_id);
  assert.equal(saved.target_type, null);
  assert.equal(saved.target_id, null);
  assert.equal(saved.target_ids, null);
});

test('target updates store numeric IDs and reject blank IDs for selected target types', async () => {
  const entry = await model.createEntry(base);
  await model.updateEntry(entry.content_id, { target_type: 'category', target_id: '42' });
  assert.equal(rows.get(entry.content_id).target_id, 42);
  await model.updateEntry(entry.content_id, { title: 'Updated title' });
  assert.equal(rows.get(entry.content_id).target_id, 42);
  await assert.rejects(model.updateEntry(entry.content_id, { target_type: 'category', target_id: '' }), /target_id must be a positive integer/);
  assert.equal(rows.get(entry.content_id).target_id, 42);
});

test('no destination clears an existing target when multipart omits target_id', async () => {
  const entry = await model.createEntry({ ...base, target_type: 'product', target_id: 42, target_ids: [42] });
  const res = response();
  await controller.updateEntry({ params: { id: entry.content_id }, body: { target_type: '', target_ids: '[]' } }, res);
  assert.equal(res.code, 200);
  assert.equal(rows.get(entry.content_id).target_type, null);
  assert.equal(rows.get(entry.content_id).target_id, null);
  assert.equal(rows.get(entry.content_id).target_ids, null);
});

test('create stores validated values and returns camelCase; omitted fields default', async () => {
  const res = response();
  await controller.createEntry({ body: { ...base, ...motion } }, res);
  assert.equal(res.code, 201);
  assertMotion(res.payload.data, motion);
  assert.equal(rows.get(1).motion_effect, 'falling_petals');
  assertMotion(await model.createEntry(base), defaults);
});

test('invalid enums return 400 on create and update before changing stored values', async () => {
  await model.createEntry({ ...base, ...motion });
  for (const name of Object.keys(motion)) {
    for (const invalid of ['invalid', '', null, ['none']]) {
      const createRes = response();
      await controller.createEntry({ body: { ...base, [name]: invalid } }, createRes);
      assert.equal(createRes.code, 400);
      assert.match(createRes.payload.message, new RegExp(`${name} must be one of:`));
      const updateRes = response();
      await controller.updateEntry({ params: { id: 1 }, body: { [name]: invalid } }, updateRes);
      assert.equal(updateRes.code, 400);
    }
  }
  assert.equal(rows.size, 1);
  assertMotion(await model.getEntryById(1), motion);
});

test('update without motion preserves values; partial update replaces only supplied fields', async () => {
  await model.createEntry({ ...base, ...motion });
  const res = response();
  await controller.updateEntry({ params: { id: 1 }, body: { title: 'Updated' } }, res);
  assert.equal(res.code, 200);
  assertMotion(res.payload.data, motion);
  assertMotion(await model.updateEntry(1, { motionSpeed: 'slow' }), { ...motion, motionSpeed: 'slow' });
});

test('non-promotional zones ignore even invalid motion fields and store defaults', async () => {
  const entry = await model.createEntry({ ...base, zone: 'navbar_background', ...motion, motionEffect: 'invalid' });
  assertMotion(entry, defaults);
  assert.equal(rows.get(entry.content_id).motion_effect, 'none');
  await model.updateEntry(entry.content_id, { ...motion, motionSpeed: 'invalid' });
  assert.equal(rows.get(entry.content_id).motion_speed, 'normal');
});

test('duplicate copies all motion settings', async () => {
  const entry = await model.createEntry({ ...base, ...motion });
  const res = response();
  await controller.duplicateEntry({ params: { id: entry.content_id } }, res);
  assertMotion(res.payload.data, motion);
  assert.equal(rows.get(2).motion_intensity, 'high');
});

test('list, detail, resolved and mobile CMS responses expose camelCase motion settings', async () => {
  await model.createEntry({ ...base, ...motion, is_published: true });
  const list = response(); await controller.listEntries({ query: {} }, list);
  assertMotion(list.payload.data.entries[0], motion);
  const detail = response(); await controller.getEntry({ params: { id: 1 } }, detail);
  assertMotion(detail.payload.data, motion);
  const resolved = response(); await controller.getResolvedZones({ params: { module: 'product' } }, resolved);
  assertMotion(resolved.payload.data.promotional_banner, motion);
  const original = moduleIcons.getActiveModules;
  moduleIcons.getActiveModules = async () => [];
  try {
    const mobile = response(); await mobileController.getMobileContent({ query: { module: 'product' } }, mobile);
    assertMotion(mobile.payload.data.content.product.promotional_banner, motion);
  } finally { moduleIcons.getActiveModules = original; }
});

test('null legacy fields return defaults, including navbar resolution', async () => {
  rows.set(1, { ...base, content_id: 1, zone: 'navbar_background', is_default: 1, motion_effect: null, motion_intensity: null, motion_speed: null });
  assertMotion(await model.getEntryById(1), defaults);
  const navbar = response(); await controller.getResolvedNavbar({}, navbar);
  assertMotion(navbar.payload.data.product, defaults);
  rows.get(1).zone = 'promotional_banner';
  assertMotion(await model.getEntryById(1), defaults);
});
