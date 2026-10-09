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
