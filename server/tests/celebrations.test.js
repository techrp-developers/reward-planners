const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const policy = require('../utils/celebrationRequest');

const body = (kind = 'cake') => ({ kind, title: 'Team birthday', date: '2099-12-20', time: '15:00', location: 'Pune office',
  contact_name: 'HR', contact_email: 'hr@example.com', contact_phone: '9876543210', request_key: '00000000-0000-4000-8000-000000000001',
  flavour: 'Chocolate', weight_kg: '1', quantity: '2', dietary: 'eggless', cake_message: 'Happy birthday',
  event_type: 'Team gathering', guests: '40', duration_hours: '3', services: 'Catering' });
const req = (overrides = {}) => ({ user: { role: 'hr', company_id: 7, user_id: 3 }, body: body(), query: {}, params: {}, ...overrides });
const response = () => ({ code: 200, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } });
function load(query) {
  const context = { exports: {}, console: { error() {} }, require(name) {
    if (name === '../config/database') return { query };
    if (name === 'node:crypto') return crypto;
    if (name === '../utils/celebrationRequest') return policy;
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/celebrationController.js'), 'utf8'), context);
  return context.exports;
}
test('cake requests normalize preferences and exclude event fields', () => {
  const result = policy.normalize(body());
  assert.equal(result.details.quantity, 2); assert.equal(result.details.weight_kg, 1);
  assert.equal(result.details.dietary, 'eggless'); assert.equal(result.details.guests, undefined);
});
test('event requests retain services and exclude cake fields', () => {
  const result = policy.normalize(body('event'));
  assert.equal(result.details.guests, 40); assert.equal(result.details.duration_hours, 3);
  assert.equal(result.details.services, 'Catering'); assert.equal(result.details.flavour, undefined);
});
test('scheduling validates calendar dates, times and India timezone', () => {
  const value = { ...body(), date: '2026-12-01', time: '10:00' };
  assert.doesNotThrow(() => policy.normalize(value, Date.parse('2026-12-01T04:29:00Z')));
  assert.throws(() => policy.normalize(value, Date.parse('2026-12-01T04:30:00Z')), /future/);
  for (const invalid of [{ date: '2099-02-30' }, { time: '24:00' }, { date: '2020-01-01' }]) assert.throws(() => policy.normalize({ ...body(), ...invalid }), { status: 400 });
});
test('invalid quantities, contacts and unsupported dining requests are rejected', () => {
  for (const invalid of [{ quantity: 0 }, { quantity: 1.5 }, { weight_kg: 100 }, { dietary: 'anything' }, { contact_phone: '-------' },
    { contact_email: 'bad' }, { budget: true }, { kind: 'dining' }, { requirements: 'x'.repeat(4001) }]) {
    assert.throws(() => policy.normalize({ ...body(), ...invalid }), { status: 400 });
  }
  for (const invalid of [{ guests: 0 }, { guests: 1.2 }, { duration_hours: 0 }, { event_type: '' }]) {
    assert.throws(() => policy.normalize({ ...body('event'), ...invalid }), { status: 400 });
  }
});
test('creation uses company and user from authentication, not the form', async () => {
  let inserted;
  const controller = load(async (sql, params) => {
    if (sql.includes('SELECT')) return [[]];
    inserted = params; return [{ insertId: 12 }];
  });
  const res = response(); await controller.create(req({ body: { ...body(), company_id: 999, created_by: 999, status: 'confirmed' } }), res);
  assert.equal(res.code, 201); assert.equal(res.body.data.reference, 'CEL-12');
  assert.equal(inserted[0], 7); assert.equal(inserted[1], 3);
  assert.equal(JSON.parse(inserted[4]).status, undefined);
});
test('successful retry is idempotent even after the scheduled date', async () => {
  const data = { ...body(), date: '2020-01-01' };
  const hash = crypto.createHash('sha256').update(JSON.stringify(policy.normalize(data, -Infinity))).digest('hex');
  const controller = load(async sql => { assert.match(sql, /SELECT/); return [[{ id: 12, request_hash: hash }]]; });
  const res = response(); await controller.create(req({ body: data }), res);
  assert.equal(res.code, 200); assert.equal(res.body.data.id, 12);
});
test('new requests cannot be created in the past', async () => {
  const controller = load(async sql => { assert.match(sql, /SELECT/); return [[]]; });
  const res = response(); await controller.create(req({ body: { ...body(), date: '2020-01-01' } }), res); assert.equal(res.code, 400);
});
test('request key reuse with changed details is rejected', async () => {
  const controller = load(async () => [[{ id: 12, request_hash: 'different' }]]);
  const res = response(); await controller.create(req(), res); assert.equal(res.code, 409);
});
test('HR lists are scoped to their company and requested celebration type', async () => {
  const controller = load(async (sql, params) => {
    assert.match(sql, /r.company_id = \?/); assert.match(sql, /r.kind = \?/); assert.deepEqual(Array.from(params), [7, 'cake', 0]);
    return [[{ id: 12, details: '{"title":"Birthday"}' }]];
  });
  const res = response(); await controller.list(req({ query: { company_id: 999, kind: 'cake' } }), res);
  assert.equal(res.body.data[0].details.title, 'Birthday');
});
test('unlinked HR and unrelated roles cannot read requests', async () => {
  const controller = load(async () => { throw new Error('Must not query'); });
  for (const user of [{ role: 'hr' }, { role: 'vendor', company_id: 7 }]) {
    const res = response(); await controller.list(req({ user }), res); assert.equal(res.code, 403);
  }
});
test('vendor manager sees the inbox but cannot create an HR request', async () => {
  const controller = load(async sql => { assert.doesNotMatch(sql, /r.company_id = \?/); return [[]]; });
  const request = req({ user: { role: 'vendor_manager', user_id: 5 } });
  const listed = response(); await controller.list(request, listed); assert.equal(listed.code, 200);
  const created = response(); await controller.create(request, created); assert.equal(created.code, 403);
});
test('only manager can reply and stale updates do not overwrite a newer reply', async () => {
  const controller = load(async (sql, params) => { assert.match(sql, /version = version \+ 1/); assert.equal(params[4], 1); return [{ affectedRows: 0 }]; });
  const request = req({ params: { id: 12 }, body: { status: 'confirmed', version: 1, manager_reply: 'Confirmed for 3 PM' } });
  const hr = response(); await controller.update(request, hr); assert.equal(hr.code, 403);
  const manager = response(); await controller.update({ ...request, user: { role: 'vendor_manager', user_id: 5 } }, manager); assert.equal(manager.code, 409);
});
test('manager can save a confirmation and reply', async () => {
  const controller = load(async (sql, params) => { assert.equal(params[2], 5); return [{ affectedRows: 1 }]; });
  const res = response(); await controller.update(req({ user: { role: 'vendor_manager', user_id: 5 }, params: { id: 12 }, body: { status: 'confirmed', version: 1, manager_reply: 'Confirmed' } }), res);
  assert.equal(res.body.success, true);
});
