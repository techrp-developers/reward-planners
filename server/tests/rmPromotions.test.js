const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const content = require('../services/promotions/content');
const valid = { name: 'Rewards', subject: 'New rewards', message: 'Hello employees', companyId: 7, audience: 'all', layout: 'hero', mediaUrl: '' };

test('rich text retains headings, colors and emphasis above and below a five-image gallery', () => {
  const input = { ...valid, images: Array.from({ length: 5 }, (_, i) => `https://example.com/${i}.jpg`), imageLayout: 'collage', richText: {
    above: [{ insert: 'Welcome', attributes: { bold: true, color: '#ff0000' } }, { insert: '\n', attributes: { header: 1, align: 'center' } }],
    below: [{ insert: 'Closing paragraph', attributes: { italic: true, underline: true, background: '#ffff00' } }, { insert: '\n' }],
  } };
  const normalized = content.validate(input);
  assert.equal(normalized.message, 'Welcome\n\nClosing paragraph');
  const html = content.render(normalized);
  assert.match(html, /<h1 style="[^"]*text-align:center/);
  assert.match(html, /color:#ff0000/);
  assert.match(html, /<strong>Welcome<\/strong>/);
  assert.match(html, /<u><em>Closing paragraph<\/em><\/u>/);
  assert.equal((html.match(/<img /g) || []).length, 5);
  assert.ok(html.indexOf('Welcome') < html.indexOf('https://example.com/0.jpg'));
  assert.ok(html.indexOf('Closing paragraph') > html.indexOf('https://example.com/4.jpg'));
});

test('image arrangements preserve order and produce the intended number of rows', () => {
  for (const [imageLayout, rows] of [['row', 1], ['column', 5], ['collage', 3]]) {
    const input = content.validate({ ...valid, images: Array.from({ length: 5 }, (_, i) => `https://example.com/${i}.jpg`), imageLayout });
    const html = content.render(input);
    assert.equal((html.match(/table-layout:fixed/g) || []).length, rows);
    for (let i = 1; i < 5; i++) assert.ok(html.indexOf(`/${i - 1}.jpg`) < html.indexOf(`/${i}.jpg`));
  }
});

test('server rejects excess images, unsafe image URLs and rich-text embeds', () => {
  for (const input of [
    { ...valid, images: Array(6).fill('https://example.com/a.jpg'), imageLayout: 'row' },
    { ...valid, images: ['javascript:alert(1)'], imageLayout: 'row' },
    { ...valid, images: ['https://example.com/a.jpg'], imageLayout: 'unknown' },
    { ...valid, richText: { above: [{ insert: { image: 'https://example.com/a.jpg' } }], below: [] } },
    { ...valid, richText: { above: [], below: [] } },
    { ...valid, richText: { above: [{ insert: 'a'.repeat(10001) }], below: [] } },
  ]) assert.throws(() => content.validate(input));
});

test('rich-text renderer never trusts HTML, arbitrary attributes or CSS from the client', () => {
  const value = content.validate({ ...valid, richText: { above: [{ insert: '<img src=x onerror=alert(1)>', attributes: { color: 'red;position:fixed', background: 'url(https://bad)', header: 'script', link: 'javascript:alert(1)', onclick: 'alert(1)' } }], below: [] } });
  const html = content.render(value);
  assert.match(html, /&lt;img/);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('position:fixed'));
  assert.ok(!html.includes('javascript:'));
});

test('validates future delivery and rejects unsafe media and invalid audiences', () => {
  for (const input of [
    { ...valid, scheduledAt: '2001-01-01' }, { ...valid, scheduledAt: 'invalid' },
    { ...valid, audience: 'custom', employeeIds: [] }, { ...valid, companyId: -1 },
    { ...valid, audience: 'everyone' }, { ...valid, layout: 'raw-html' },
    { ...valid, mediaUrl: 'javascript:alert(1)', mediaType: 'image' },
    { ...valid, mediaUrl: 'https://user:pass@example.com/a.png', mediaType: 'image' },
  ]) assert.throws(() => content.validate(input));
  assert.equal(content.validate({ ...valid, scheduledAt: '2099-01-01T12:00:00Z' }).scheduledAt, '2099-01-01T12:00:00Z');
  assert.equal(content.validate({ ...valid, subject: 'Hello\r\nBcc: bad' }).subject, 'Hello Bcc: bad');
});
test('all layouts escape content and link media without embedding executable video', () => {
  for (const layout of ['classic', 'hero', 'split']) {
    const html = content.render({ ...valid, layout, message: '<script>alert(1)</script>\nLine 2', mediaType: 'video', mediaUrl: 'https://example.com/video?a=1&b=2' });
    assert.ok(!html.includes('<script>'));
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /Watch video/);
    assert.match(html, /a=1&amp;b=2/);
    assert.match(html, /<br>Line 2/);
  }
});
test('recipients are deduplicated and invalid/missing addresses are skipped', () => {
  assert.deepEqual(content.recipients([{ email: ' A@Example.com ' }, { email: 'a@example.com' }, { email: null }, { email: 'a@b.com,b@c.com' }]), ['a@example.com']);
});

function routesFixture({ employees = [{ id: 12, email: 'staff@example.com' }], failInsert = false } = {}) {
  const routes = {}, queries = [], roles = [], transaction = [];
  const router = { use() {}, get(url, ...handlers) { routes[`GET ${url}`] = handlers.at(-1); }, post(url, ...handlers) { routes[`POST ${url}`] = handlers.at(-1); } };
  const connection = {
    beginTransaction: async () => transaction.push('begin'), commit: async () => transaction.push('commit'), rollback: async () => transaction.push('rollback'), release: () => transaction.push('release'),
    execute: async (sql, args) => { queries.push({ sql, args }); return [{ insertId: 44 }]; },
    query: async (sql, args) => { if (failInsert) throw new Error('Insert failed'); queries.push({ sql, args }); return [{}]; },
  };
  const db = { getConnection: async () => connection, execute: async (sql, args) => {
    queries.push({ sql, args });
    if (sql.includes('FROM companies')) return [[{ email: 'company@example.com' }]];
    if (sql.includes('FROM company_users')) return [employees];
    if (sql.includes('UPDATE rm_promotions')) return [{ affectedRows: 0 }];
    return [[]];
  } };
  const multer = () => ({ single: () => () => {} }); multer.memoryStorage = () => ({});
  const context = { module: { exports: {} }, console: { error() {} }, require(name) {
    if (name === 'express') return { Router: () => router };
    if (name === 'multer') return multer;
    if (name.endsWith('database')) return db;
    if (name.endsWith('/auth')) return { authenticateToken() {}, authorizeRoles: (...values) => { roles.push(...values); return () => {}; } };
    if (name.endsWith('/content')) return content;
    if (name.endsWith('mailTransport')) return { assertMailConfigured() {} };
    if (name === 'express-rate-limit') return { rateLimit: () => () => {} };
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/promotionRoutes.js'), 'utf8'), context);
  return { queries, transaction, roles, async request(route, body = valid) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await routes[route]({ body, user: { user_id: 3, email: 'rm@example.com' }, params: { id: '44' } }, res);
    return res;
  } };
}
test('company contact campaign stores server-resolved recipient in a transaction', async () => {
  const fixture = routesFixture();
  const result = await fixture.request('POST /', { ...valid, audience: 'company', email: 'attacker@example.com' });
  assert.equal(result.code, 201);
  assert.deepEqual(fixture.roles, ['rm']);
  assert.deepEqual(fixture.transaction, ['begin', 'commit', 'release']);
  const recipients = fixture.queries.find(query => query.sql.includes('INSERT INTO rm_promotion_recipients'));
  assert.equal(recipients.args[0][0][1], 'company@example.com');
});
test('custom employees must belong to the selected active company', async () => {
  const fixture = routesFixture();
  const result = await fixture.request('POST /', { ...valid, audience: 'custom', employeeIds: [99] });
  assert.equal(result.code, 400);
  assert.equal(fixture.transaction.length, 0);
  assert.match(fixture.queries[1].sql, /company_id=\? AND status=1/);
});
test('all employees deduplicate and persist unique recipients', async () => {
  const fixture = routesFixture({ employees: [{ id: 1, email: 'a@example.com' }, { id: 2, email: 'A@example.com' }, { id: 3, email: null }] });
  const result = await fixture.request('POST /');
  assert.equal(result.body.recipients, 1);
});
test('failed recipient insertion rolls back the entire campaign', async () => {
  const fixture = routesFixture({ failInsert: true });
  assert.equal((await fixture.request('POST /')).code, 500);
  assert.deepEqual(fixture.transaction, ['begin', 'rollback', 'release']);
});
test('cancellation is owner-scoped and rejects already started campaigns', async () => {
  const fixture = routesFixture();
  assert.equal((await fixture.request('POST /:id/cancel')).code, 409);
  assert.match(fixture.queries[0].sql, /owner_id=\? AND status='scheduled'/);
  assert.equal(fixture.queries[0].args[1], 3);
});

function workerFixture({ locked = true, failMail = false, cancelled = false } = {}) {
  const queries = [], sent = [];
  let released = false;
  const connection = {
    query: async sql => { queries.push(sql); return [[{ acquired: locked ? 1 : 0 }]]; },
    execute: async (sql) => {
      queries.push(sql);
      if (sql.startsWith('SELECT *')) return [[{ id: 44, content: JSON.stringify(valid), reply_to: 'rm@example.com' }]];
      if (sql.startsWith('SELECT id,email')) return [[{ id: 1, email: 'staff@example.com' }]];
      return [{ affectedRows: cancelled ? 0 : 1 }];
    }, release: () => { released = true; },
  };
  const context = { module: { exports: {} }, console: { error() {} }, require(name) {
    if (name.endsWith('database')) return { getConnection: async () => connection };
    if (name.endsWith('mailService')) return { sendMail: async message => { if (failMail) throw new Error('SMTP down'); sent.push(message); } };
    if (name.endsWith('mailTransport')) return { assertMailConfigured() {} };
    if (name === './content') return content;
    if (name === 'node-cron') return { schedule() {} };
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/promotions/worker.js'), 'utf8'), context);
  return { queries, sent, tick: context.module.exports.tick, released: () => released };
}
test('worker sends private emails and records sent only after SMTP accepts', async () => {
  const fixture = workerFixture(); await fixture.tick();
  assert.equal(fixture.sent.length, 1);
  assert.equal(fixture.sent[0].to, 'staff@example.com');
  assert.equal(fixture.sent[0].replyTo, 'rm@example.com');
  assert.ok(fixture.queries.some(sql => sql.includes("SET status='sent'")));
  assert.ok(fixture.queries.some(sql => sql.includes("SET status='unknown'")));
  assert.ok(fixture.released());
});
test('worker does not deliver when another process owns the lock or campaign was cancelled', async () => {
  for (const options of [{ locked: false }, { cancelled: true }]) {
    const fixture = workerFixture(options); await fixture.tick(); assert.equal(fixture.sent.length, 0); assert.ok(fixture.released());
  }
});
test('SMTP failure is recorded without marking the recipient sent', async () => {
  const fixture = workerFixture({ failMail: true }); await fixture.tick();
  assert.ok(fixture.queries.some(sql => sql.includes("SET status='failed'")));
  assert.ok(!fixture.queries.some(sql => sql.includes("SET status='sent'")));
});
