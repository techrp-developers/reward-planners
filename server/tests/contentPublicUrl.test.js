const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getContentImageUrl, getContentPublicBaseUrl } = require('../utils/contentPublicUrl');

test('R2 content images use the CDN instead of the legacy upload server', () => {
  const key = 'public/content-zone-entries/12/banner.png';
  assert.equal(getContentImageUrl(key), `https://cdn.rewardplanners.com/${key}`);
  assert.equal(getContentImageUrl(`/${key}`), `https://cdn.rewardplanners.com/${key}`);
});

test('legacy uploads, absolute URLs and empty images retain their behavior', () => {
  assert.equal(getContentImageUrl('/uploads/content-zone-entries/12/banner.png'), `${getContentPublicBaseUrl()}/uploads/content-zone-entries/12/banner.png`);
  assert.equal(getContentImageUrl('https://example.com/banner.png'), 'https://example.com/banner.png');
  assert.equal(getContentImageUrl(null), null);
});
