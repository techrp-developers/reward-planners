const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const express = require('express');
const { processCoverImage } = require('../controllers/coverImageController');
const { coverImageUpload, coverImageConcurrency } = require('../middleware/mediaUpload/coverImageUpload');
const { optimizeProductImage } = require('../utils/productCoverImage');

 test('cover preview validation, provider errors, multipart and quality preservation', async (t) => {
  t.mock.method(require('../services/coverImageBudget'), 'reserveCoverRequest', () => {});
  const app = express();
  app.post('/preview', coverImageUpload, processCoverImage);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/preview`;
  const originalFetch = global.fetch;
  const originalKey = process.env.POOF_API_KEY;
  let calls = 0;
  let providerStatus = 200;
  let invalidResponse = false;
  const input = await sharp({ create: { width: 100, height: 200, channels: 3, background: 'red' } }).png().toBuffer();
  const provider = await sharp({ create: { width: 100, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 40, height: 80, channels: 4, background: 'red' } }).png().toBuffer(), left: 30, top: 60 }]).png().toBuffer();
  global.fetch = async (target, options) => {
    assert.equal(target, 'https://api.poof.bg/v1/remove');
    calls++;
    assert.equal(options.headers.get('x-api-key'), 'test-secret');
    assert.equal(options.headers.get('Content-Type'), null);
    for (const [key, value] of Object.entries({ format: 'png', channels: 'rgba', crop: 'true', padding: '0' })) {
      assert.equal(options.body.get(key), value);
    }
    assert.ok(options.body.get('image_file'));
    if (providerStatus === 'timeout') { const e = new Error(); e.name = 'TimeoutError'; throw e; }
    if (providerStatus !== 200) return new Response(JSON.stringify({ code: ({401:'authentication_error',403:'permission_denied',402:'payment_required',429:'rate_limit_exceeded',400:'validation_error',422:'validation_error'})[providerStatus] || 'internal_server_error', message: 'mock failure' }), { status: providerStatus, headers: { 'content-type': 'application/json' } });
    return new Response(invalidResponse ? 'bad' : provider, { status: providerStatus, headers: { 'content-type': 'image/png' } });
  };
  async function request(files = [input], type = 'image/png', field = 'images') {
    const form = new FormData();
    files.forEach(buffer => form.append(field, new Blob([buffer], { type }), 'cover.png'));
    return originalFetch(url, { method: 'POST', body: form });
  }
  try {
    delete process.env.POOF_API_KEY;
    assert.equal((await request()).status, 503);
    assert.equal(calls, 0);
    process.env.POOF_API_KEY = 'test-secret';
    assert.equal((await request([])).status, 400);
    assert.equal((await request([Buffer.from('invalid')])).status, 400);
    assert.equal((await request([input], 'image/jpeg')).status, 400);
    assert.equal((await request([input, input])).status, 400);
    assert.equal((await request([input], 'image/png', 'wrong')).status, 400);
    assert.equal((await request([Buffer.alloc(10 * 1024 * 1024 + 1)])).status, 413);
    const animated = await sharp({ create: { width: 6200, height: 6000, channels: 3, background: 'red' } }).png().toBuffer();
    assert.equal((await request([animated])).status, 400);
    assert.equal(calls, 0);
    for (const [format, mime] of [['jpeg', 'image/jpeg'], ['webp', 'image/webp']]) {
      const converted = await sharp(input).toFormat(format).toBuffer();
      const response = await request([converted], mime);
      assert.equal(response.status, 200);
      assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width, 1800);
    }
    const success = await request();
    assert.equal(success.status, 200);
    assert.equal(success.headers.get('content-type'), 'image/webp');
    assert.equal(success.headers.get('cache-control'), 'no-store');
    const output = Buffer.from(await success.arrayBuffer());
    const meta = await sharp(output).metadata();
    assert.equal(meta.width, 1800); assert.equal(meta.height, 1800);
    assert.equal(meta.format, 'webp'); assert.equal(meta.hasAlpha, true);
    assert.equal((await sharp(output).stats()).isOpaque, false);
    assert.deepEqual(await optimizeProductImage(output), output);
    const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let y = 0; y < 1800; y++) for (let x = 0; x < 1800; x++) {
      if (x < 90 || x >= 1710 || y < 90 || y >= 1710) assert.equal(data[(y * info.width + x) * 4 + 3], 0);
    }
    for (const [upstream, expected] of [[401,503],[403,503],[402,402],[429,429],[400,400],[422,400],[500,502],['timeout',504]]) {
      providerStatus = upstream;
      const response = await request();
      assert.equal(response.status, expected);
      assert.equal((await response.json()).success, false);
    }
    providerStatus = 200; invalidResponse = true;
    assert.equal((await request()).status, 502);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.POOF_API_KEY; else process.env.POOF_API_KEY = originalKey;
    await new Promise(resolve => server.close(resolve));
  }
});


test('same user cannot process concurrent covers, including after disconnect', async () => {
  const { EventEmitter } = require('node:events');
  const req = { user: { user_id: 321, role: "vendor" } };
  const res = new EventEmitter();
  let accepted = false;
  coverImageConcurrency(req, res, () => { accepted = true; });
  assert.ok(accepted);
  let resolve;
  const work = new Promise(r => { resolve = r; });
  req.coverImageWork(work);
  res.emit('close');
  const rejected = { status(code) { assert.equal(code, 429); return this; }, json(body) { assert.equal(body.code, 'COVER_IMAGE_IN_PROGRESS'); } };
  coverImageConcurrency({ user: req.user }, rejected, () => assert.fail('concurrent processing accepted'));
  resolve(); await work; await Promise.resolve();
  const next = new EventEmitter();
  coverImageConcurrency({ user: req.user }, next, () => {});
  next.emit('finish');
});

test('account budget admits four starts in any rolling minute across users', () => {
  const { createCoverImageBudget } = require('../services/coverImageBudget');
  let time = 0;
  const reserve = createCoverImageBudget(() => time);
  for (let i = 0; i < 4; i++) { time = i * 100; reserve(); }
  time = 59_999;
  assert.throws(reserve, error => error.status === 429 && error.retryAfter === 1);
  time = 60_000; reserve();
  assert.throws(reserve, error => error.code === 'COVER_ACCOUNT_RATE_LIMITED');
  time = 60_300; reserve(); reserve(); reserve();
  assert.throws(reserve, /Too many/);
});

test('invalid user IDs are rejected before limiter or concurrency state', () => {
  const { coverImageLimiter } = require('../middleware/mediaUpload/coverImageUpload');
  for (const id of [undefined, null, 0, -1, '', 'undefined', {}, 1.5, true, Number.MAX_SAFE_INTEGER + 1]) {
    for (const middleware of [coverImageLimiter, coverImageConcurrency]) {
      const req = { user: { role: 'vendor', user_id: id } };
      const res = { status(code) { assert.equal(code, 401); return this; }, json(body) { assert.equal(body.code, 'INVALID_COVER_USER'); } };
      middleware(req, res, () => assert.fail('Invalid user accepted'));
    }
  }
});

test('hung promises expire after cooldown; late old completion cannot unlock a new request', async t => {
  const { EventEmitter } = require('node:events');
  const { COVER_LOCK_MS } = require('../middleware/mediaUpload/coverImageUpload');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const req = { user: { role: 'vendor', user_id: 888 } };
  const res = new EventEmitter();
  let resolve;
  const work = new Promise(r => { resolve = r; });
  coverImageConcurrency(req, res, () => {}); req.coverImageWork(work); res.emit('close');
  const rejected = { status(code) { assert.equal(code, 429); return this; }, json() {} };
  t.mock.timers.tick(65_000);
  coverImageConcurrency({ user: req.user }, rejected, () => assert.fail('Premature unlock'));
  t.mock.timers.tick(COVER_LOCK_MS - 65_000);
  const nextReq = { user: { role: 'vendor', user_id: '888' } };
  const nextRes = new EventEmitter();
  let accepted = false;
  coverImageConcurrency(nextReq, nextRes, () => { accepted = true; });
  assert.ok(accepted);
  resolve(); await work; await Promise.resolve();
  coverImageConcurrency({ user: req.user }, rejected, () => assert.fail('Old completion released new lock'));
  nextRes.emit('finish');
});

test('SDK timeout rejection releases lock; disconnected uploads without work release immediately', async () => {
  const { EventEmitter } = require('node:events');
  const req = { user: { role: 'vendor', user_id: 777 } };
  const res = new EventEmitter();
  coverImageConcurrency(req, res, () => {});
  req.coverImageWork(Promise.reject(new Error('timeout')));
  await Promise.resolve(); await Promise.resolve();
  const res2 = new EventEmitter();
  coverImageConcurrency({ user: req.user }, res2, () => {}); res2.emit('close');
  const res3 = new EventEmitter();
  let accepted = false;
  coverImageConcurrency({ user: req.user }, res3, () => { accepted = true; });
  assert.ok(accepted); res3.emit('finish');
});

test('manual preparation returns padded WebP for opaque and transparent inputs without any provider calls', async t => {
  const { prepareCoverImage } = require('../controllers/coverImageController');
  const app = express(); app.post('/prepare', coverImageUpload, prepareCoverImage);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const originalFetch = global.fetch;
  let providerCalls = 0;
  t.mock.method(global, 'fetch', () => { providerCalls++; throw new Error('Poof must not be called'); });
  t.mock.method(require('../services/coverImageBudget'), 'reserveCoverRequest', () => assert.fail('Manual processing reserved Poof budget'));
  try {
    for (const [format, type] of [['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']]) {
      const input = await sharp({ create: { width: 100, height: 200, channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: format === 'jpeg' ? 1 : 0.5 } } }).toFormat(format).toBuffer();
      const form = new FormData(); form.append('images', new Blob([input], { type }), `cover.${format}`);
      const response = await originalFetch(`http://127.0.0.1:${server.address().port}/prepare`, { method: 'POST', body: form });
      assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/webp');
      const output = Buffer.from(await response.arrayBuffer());
      const m = await sharp(output).metadata();
      assert.equal(m.width, 1800); assert.equal(m.height, 1800); assert.equal(m.hasAlpha, true);
      const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(data[3], 0);
      assert.equal(data[(900 * info.width + 900) * 4 + 3], format === 'jpeg' ? 255 : 128);
      assert.deepEqual(await optimizeProductImage(output), output);
    }
    const invalid = new FormData(); invalid.append('images', new Blob(['invalid'], { type: 'image/png' }), 'bad.png');
    assert.equal((await originalFetch(`http://127.0.0.1:${server.address().port}/prepare`, { method: 'POST', body: invalid })).status, 400);
    assert.equal(providerCalls, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
