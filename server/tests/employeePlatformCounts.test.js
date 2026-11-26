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
      return [[Array.isArray(counts) ? counts[queries.length - 1] : counts]];
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
  assert.equal(res.body.data.registration_coverage_percentage, 0);
  assert.equal(res.body.data.pending_registration_count, 0);
});

test('returns scoreboard totals, coverage, availability and refresh metadata', async () => {
  const { res, queries } = await request([
    { android_user_count: '191', ios_user_count: '25' },
    { total_employee_count: '1483', enabled_employee_count: '1441', enabled_registered_employee_count: '360' },
    { registered_app_user_count: '363', registered_disabled_employee_user_count: '3' },
    { corporate_client_count: '12', vendor_partner_count: '24' },
  ]);
  const data = res.body.data;
  assert.equal(data.total_mobile_user_count, 216);
  assert.equal(data.total_employee_count, 1483);
  assert.equal(data.disabled_employee_count, 42);
  assert.equal(data.registered_app_user_count, 363);
  assert.equal(data.registered_disabled_employee_user_count, 3);
  assert.equal(data.enabled_employee_count, 1441);
  assert.equal(data.enabled_registered_employee_count, 360);
  assert.equal(data.pending_registration_count, 1081);
  assert.equal(data.registration_coverage_percentage, 24.98);
  assert.equal(data.corporate_client_count, 12);
  assert.equal(data.vendor_partner_count, 24);
  assert.equal(data.rewards_earned, null);
  assert.equal(data.rewards_earned_status, 'unavailable');
  assert.ok(Number.isFinite(Date.parse(data.last_successful_refresh_at)));
  assert.equal(data.refresh_interval_seconds, 30);
  assert.match(queries[1], /SELECT DISTINCT company_user_id, company_id FROM customer/);
  assert.match(queries[1], /registered.company_id = cu.company_id/);
});

test('database failures return an error rather than a misleading zero count', async () => {
  const { res } = await request({}, true);
  assert.equal(res.code, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, undefined);
});
