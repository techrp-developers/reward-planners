const { test } = require('node:test');
const assert = require('node:assert/strict');
const { contentNavigation } = require('../utils/contentNavigation');

for (const type of ['product', 'service']) {
  test(`${type}: single selection opens details, multiple open offer, duplicates do not create an offer`, () => {
    const base = { content_id: 5, target_type: type, target_id: 11 };
    assert.deepEqual(contentNavigation(base), { destination: `${type}_details`, targetId: 11, contentId: 5 });
    assert.deepEqual(contentNavigation({ ...base, target_ids: '[11,12]' }), { destination: `${type}_offer`, targetIds: [11, 12], contentId: 5 });
    assert.deepEqual(contentNavigation({ ...base, target_ids: '[11,11]' }), { destination: `${type}_details`, targetId: 11, contentId: 5 });
  });
}

test('bundle and category destinations remain direct links', () => {
  assert.deepEqual(contentNavigation({ target_type: 'service_bundle', target_id: 8 }), { destination: 'service_bundle_details', targetId: 8 });
  assert.deepEqual(contentNavigation({ target_type: 'service_category', target_id: 9 }), { destination: 'service_category', targetId: 9 });
  assert.equal(contentNavigation({ target_type: null }), null);
});
