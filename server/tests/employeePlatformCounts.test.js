const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function request(counts, fail = false) {
  const queries = [];
  const context = { module: { exports: {} }, console: { error() {} }, require(name) {
    if (name === '../config/database') return { execute: async sql => {
      queries.push(sql);
      if (fail) throw new Error('Database unavailable');
      return [[counts]];
    } };
    return {};
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/managerController.js'), 'utf8'), context);
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await context.module.exports.employeeDirectoryPlatformCounts({}, res);
  return { res, queries };
}

test('returns numeric platform counts and their combined total', async () => {
  const { res, queries } = await request({ android_user_count: '120', ios_user_count: '30' });
  assert.equal(res.body.data.android_user_count, 120);
  assert.equal(res.body.data.ios_user_count, 30);
  assert.equal(res.body.data.total_mobile_user_count, 150);
  assert.match(queries[0], /COUNT\(DISTINCT CASE/);
  assert.match(queries[0], /co.status = 1 AND c.status = 1/);
  assert.match(queries[0], /NULLIF\(TRIM\(c.device_id\), ''\) IS NOT NULL/);
  assert.doesNotMatch(queries[0], /JOIN company_users/);
});

test('empty counts return a zero total', async () => {
  const { res } = await request({ android_user_count: 0, ios_user_count: 0 });
  assert.equal(res.body.data.total_mobile_user_count, 0);
});

test('database failures return an error rather than a misleading zero count', async () => {
  const { res } = await request({}, true);
  assert.equal(res.code, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, undefined);
});
