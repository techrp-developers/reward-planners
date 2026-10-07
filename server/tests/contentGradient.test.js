const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrateContentGradientColors } = require('../utils/contentGradientMigration');
const dbPath = require.resolve('../config/database');
const calls = [];
const gradient = JSON.stringify({ type: 'gradient', colors: ['#852BAF', '#C026D3', '#FC3F78'], direction: 'left-right' });
const entry = { content_id: 1, module: 'product', zone: 'navbar_background', content_type: 'color', color_value: gradient, title: 'Navbar' };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  async query(sql, params) {
    calls.push({ sql, params });
    return sql.includes('SELECT') ? [[entry]] : [{ insertId: 1 }];
  },
} };
const model = require('../models/contentZoneModel');

test('widens legacy HEX column and preserves its collation and nullability', async () => {
  const statements = [];
  await migrateContentGradientColors({ async query(sql) {
    statements.push(sql);
    return [[{ Type: 'varchar(7)', Null: 'YES', Default: null, Extra: '', Collation: 'utf8mb4_unicode_ci' }]];
  } });
  assert.equal(statements[1], 'ALTER TABLE content_zone_entries MODIFY COLUMN color_value TEXT COLLATE utf8mb4_unicode_ci NULL');
});

test('migration is idempotent and refuses unexpected definitions', async () => {
  let queries = 0;
  await migrateContentGradientColors({ async query() { queries++; return [[{ Type: 'text' }]]; } });
  assert.equal(queries, 1);
  await assert.rejects(migrateContentGradientColors({ async query() { return [[{ Type: 'int' }]]; } }), /Unexpected/);
});

test('navbar gradients survive create, update, and resolved reads', async () => {
  calls.length = 0;
  assert.equal((await model.createEntry(entry)).color_value, gradient);
  assert.equal(calls.find(call => call.sql.includes('INSERT')).params[4], gradient);
  calls.length = 0;
  assert.equal((await model.updateEntry(1, { content_type: 'color', color_value: gradient })).color_value, gradient);
  assert.ok(calls.find(call => call.sql.includes('UPDATE')).params.includes(gradient));
  assert.equal((await model.resolveActiveEntry('product', 'navbar_background')).color_value, gradient);
  assert.throws(() => model.validateEntry({ ...entry, color_value: gradient.slice(0, 7) }), /gradient JSON/);
  assert.doesNotThrow(() => model.validateEntry({ ...entry, color_value: '#852BAF' }));
});
