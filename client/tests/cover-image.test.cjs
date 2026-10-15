const { readFileSync } = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const axios = require('axios');
const source = readFileSync(path.join(__dirname, '../src/modules/products/utils/coverImage.ts'), 'utf8');
function load(width = 100, height = 100, corrupt = false) {
  const helpers = {};
  const released = [];
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, {
    exports: helpers, require: () => axios, Blob, Error, JSON,
    Image: class { naturalWidth = width; naturalHeight = height; async decode() { if (corrupt) throw new Error('bad image'); } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: url => released.push(url) },
  });
  return { helpers, released };
}
test('JPG, PNG and WebP validate and clean up temporary image URLs', async () => {
  const { helpers, released } = load();
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) await helpers.validateCoverFile({ type, size: 100 });
  assert.equal(released.length, 3);
});
test('invalid type and oversized images are rejected before creating a preview', async () => {
  const { helpers, released } = load();
  await assert.rejects(helpers.validateCoverFile({ type: 'image/gif', size: 10 }), /valid JPG/);
  await assert.rejects(helpers.validateCoverFile({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }), /10 MB/);
  assert.equal(released.length, 0);
});
test('excessive dimensions and corrupt images release their temporary URLs', async () => {
  for (const [width, height, corrupt, message] of [[6200, 6000, false, /36 megapixels/], [0, 0, true, /valid JPG/]]) {
    const { helpers, released } = load(width, height, corrupt);
    await assert.rejects(helpers.validateCoverFile({ type: 'image/png', size: 100 }), message);
    assert.equal(released.length, 1);
  }
});
test('JSON Blob errors map credits, rate limits, auth and timeout to readable messages', async () => {
  const { helpers } = load();
  for (const [status, code, expected] of [[402, 'BG_CREDITS_EXHAUSTED', /credits are exhausted/], [429, 'RATE_LIMIT', /Too many/], [504, 'TIMEOUT', /too long/], [413, 'SIZE', /10 MB/], [401, 'AUTH', /sign in/]]) {
    const error = { isAxiosError: true, response: { status, data: new Blob([JSON.stringify({ code, message: 'provider detail' })], { type: 'application/json' }) } };
    assert.match(await helpers.coverImageError(error), expected);
  }
  assert.equal(await helpers.coverImageError({ isAxiosError: true, response: { status: 400, data: new Blob(['{"message":"Choose another image"}']) } }), 'Choose another image');
  assert.match(await helpers.coverImageError({ isAxiosError: true, response: { status: 502, data: new Blob(['<html>error</html>']) } }), /Unable to process/);
  assert.match(await helpers.coverImageError({ isAxiosError: true, code: 'ECONNABORTED' }), /too long/);
});

function componentHarness() {
  const source = readFileSync(path.join(__dirname, '../src/modules/products/screens/ProductAdd.tsx'), 'utf8');
  const values = [], refs = [], effects = [], calls = [], released = [];
  let stateIndex = 0, refIndex = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => {
      const index = stateIndex++;
      if (!(index in values)) values[index] = initial;
      return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value; }];
    },
    useRef: initial => { const index = refIndex++; return refs[index] ||= { current: initial }; },
    useEffect: effect => { effects.push(effect); },
  };
  const exported = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports: exported, require: name => {
      if (name === 'react') return React;
      if (name.includes('/api/api')) return { api: { post: (url, form, config) => new Promise((resolve, reject) => calls.push({ url, form, config, resolve, reject })) } };
      if (name.includes('/utils/coverImage')) return { validateCoverFile: async () => {}, coverImageError: async () => 'Please try again', hasExhaustedCoverCredits: async error => error?.credits === true };
      return {};
    }, File, Blob, FormData, AbortController, Date, Error, Set, console,
    URL: { createObjectURL: () => `blob:preview-${calls.length}`, revokeObjectURL: url => released.push(url) },
  });
  const render = () => { stateIndex = 0; refIndex = 0; return exported.default(); };
  const find = (tree, predicate) => {
    if (!tree || typeof tree !== 'object') return undefined;
    if (predicate(tree)) return tree;
    for (const child of tree.props?.children?.flat(Infinity) || []) {
      const found = find(child, predicate); if (found) return found;
    }
  };
  const select = file => find(render(), n => n.type === 'input' && n.props.accept === 'image/jpeg,image/png,image/webp').props.onChange({ target: { files: [file], value: 'file' } });
  return { render, find, select, values, calls, released, effects };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('component stores processed WebP only, blocks submission and cleans preview on removal', async () => {
  const h = componentHarness();
  const original = new File(['original'], 'product.jpg', { type: 'image/jpeg' });
  h.select(original); await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, '/product/process-cover-image');
  assert.equal(h.calls[0].form.get('images').name, original.name);
  assert.equal(h.calls[0].config.responseType, 'blob');
  assert.equal(h.calls[0].config.headers, undefined);
  h.find(h.render(), n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 1);
  h.select(original); await flush(); assert.equal(h.calls.length, 1);
  h.calls[0].resolve({ data: new Blob(['processed'], { type: 'image/webp' }) }); await flush();
  const stored = h.values[0].productImages[0];
  assert.equal(stored.file.type, 'image/webp');
  assert.equal(await stored.file.text(), 'processed');
  assert.notEqual(stored.file, original);
  h.find(h.render(), n => n.props?.['aria-label'] === 'Remove cover image').props.onClick();
  assert.equal(h.values[0].productImages.length, 0);
  assert.ok(h.released.includes(stored.url));
});

test('component rejects stale results after unmount and supports explicit retry without original fallback', async () => {
  const h = componentHarness();
  const original = new File(['original'], 'product.png', { type: 'image/png' });
  h.select(original); await flush();
  h.calls[0].reject(new Error('provider failed')); await flush();
  assert.equal(h.values[0].productImages.length, 0);
  const retry = h.find(h.render(), n => n.type === 'button' && n.props.children.includes('Retry Image'));
  assert.ok(retry); retry.props.onClick(); await flush();
  assert.equal(h.calls.length, 2);
  const cleanup = h.effects[0](); cleanup();
  assert.equal(h.calls[1].config.signal.aborted, true);
  h.calls[1].resolve({ data: new Blob(['processed'], { type: 'image/webp' }) }); await flush();
  assert.equal(h.values[0].productImages.length, 0);
});

test('36 megapixel boundary is accepted; oversized and malformed error Blobs are safe', async () => {
  const { helpers } = load(6000, 6000);
  await helpers.validateCoverFile({ type: 'image/png', size: 100 });
  for (const body of ['null', '[]', '"error"', 'x'.repeat(16_385)]) {
    assert.match(await helpers.coverImageError({ isAxiosError: true, response: { status: 502, data: new Blob([body]) } }), /Unable to process/);
  }
});

test('only the specific JSON Blob exhaustion response activates fallback', async () => {
  const { helpers } = load();
  for (const [status, code, expected] of [[402, 'BG_CREDITS_EXHAUSTED', true], [402, 'OTHER', false], [429, 'BG_CREDITS_EXHAUSTED', false], [503, 'BACKGROUND_REMOVAL_AUTH_FAILED', false], [504, 'TIMEOUT', false]]) {
    assert.equal(await helpers.hasExhaustedCoverCredits({ isAxiosError: true, response: { status, data: new Blob([JSON.stringify({ code })]) } }), expected);
  }
});

test('exhaustion opens same original in Manual Mode; apply uses only free preparation', async () => {
  const h = componentHarness();
  const original = new File(['original'], 'photo.jpg', { type: 'image/jpeg' });
  h.select(original); await flush();
  h.calls[0].reject({ credits: true }); await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.values[0].productImages.length, 0);
  assert.equal(h.find(h.render(), n => n.props?.children?.includes('Manual Mode • Free')).props['aria-pressed'], true);
  const editor = h.find(h.render(), n => n.props.file === original && typeof n.props.onApply === 'function');
  assert.ok(editor);
  const edited = new File(['edited-transparent'], 'edited.png', { type: 'image/png' });
  editor.props.onApply(edited); await flush();
  assert.equal(h.calls[1].url, '/product/prepare-cover-image');
  h.calls[1].resolve({ data: new Blob(['manual-output'], { type: 'image/webp' }) }); await flush();
  assert.equal(await h.values[0].productImages[0].file.text(), 'manual-output');
  assert.equal(h.calls.filter(call => call.url === '/product/process-cover-image').length, 1);
});

test('deliberate Manual Mode skips AI; replacements clear the previous submitted cover', async () => {
  const h = componentHarness();
  h.find(h.render(), n => n.props?.children?.includes('Manual Mode • Free')).props.onClick();
  const original = new File(['transparent'], 'prepared.png', { type: 'image/png' });
  h.select(original); await flush();
  assert.equal(h.calls.length, 0);
  let editor = h.find(h.render(), n => n.props.file === original && typeof n.props.onApply === 'function');
  editor.props.onApply(original); await flush();
  assert.equal(h.calls[0].url, '/product/prepare-cover-image');
  h.calls[0].resolve({ data: new Blob(['output'], { type: 'image/webp' }) }); await flush();
  const oldUrl = h.values[0].productImages[0].url;
  const replacement = new File(['second'], 'second.png', { type: 'image/png' });
  h.select(replacement); await flush();
  assert.equal(h.values[0].productImages.length, 0);
  assert.ok(h.released.includes(oldUrl));
  editor = h.find(h.render(), n => n.props.file === replacement && typeof n.props.onApply === 'function');
  assert.ok(editor);
  h.find(h.render(), n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 1);
  editor.props.onCancel(); assert.equal(h.values[0].productImages.length, 0);
});

test('manual erase changes alpha and restore reinstates original RGBA without touching other pixels', () => {
  const exported = {};
  const source = readFileSync(path.join(__dirname, '../src/modules/products/utils/manualCoverBrush.ts'), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exported });
  const original = new Uint8ClampedArray([255, 0, 0, 255, 10, 20, 30, 100, 0, 255, 0, 255, 0, 0, 255, 255]);
  const pixels = original.slice();
  exported.paintCoverBrush(pixels, original, 2, 2, 0.5, 0.5, 0.4, false);
  assert.equal(pixels[3], 0); assert.equal(pixels[0], 255);
  assert.deepEqual(pixels.slice(4), original.slice(4));
  exported.paintCoverBrush(pixels, original, 2, 2, 0.5, 0.5, 0.4, true);
  assert.deepEqual(pixels, original);
});
