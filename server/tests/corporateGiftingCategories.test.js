const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const body = () => ({ recipient_type: 'team', recipient_details: 'Engineering', contact_name: 'HR', contact_email: 'hr@example.com',
  contact_phone: '9876543210', delivery_address: 'Office', request_key: 'test-request-123456789',
  items: [{ category_id: 3, subcategory_id: 8, quantity: 10, preferred_brand: 'Brand preference' }] });
const response = () => ({ code: 200, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } });
function load(query) {
  const context = { exports: {}, console, require(name) {
    if (name === '../config/database') return { query };
    if (name === 'node:crypto') return crypto;
    if (name === '../utils/publicUrl') return { getPublicUrl: value => value };
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/corporateGiftingController.js'), 'utf8'), context);
  return context.exports;
}
const request = (data = body()) => ({ user: { role: 'hr', company_id: 7, user_id: 4 }, body: data, query: {} });

test('normalizes category enquiries and ignores client-supplied names and product prices', () => {
  const value = body(); value.items[0].category_name = 'Forged'; value.items[0].sale_price = 1;
  const normalized = load().normalize(value);
  assert.equal(normalized.items[0].preferred_brand, 'Brand preference');
  assert.equal(normalized.items[0].category_name, undefined);
  assert.equal(normalized.items[0].sale_price, undefined);
});
test('rejects duplicates, old product payloads, invalid quantities and invalid subcategories', () => {
  for (const items of [[], [{ variant_id: 8, quantity: 1 }], [{ category_id: 3, subcategory_id: -1, quantity: 1 }],
    [{ category_id: 3, quantity: 0 }], [body().items[0], body().items[0]]]) {
    assert.throws(() => load().normalize({ ...body(), items }), { status: 400 });
  }
});
test('catalogue returns active categories and subcategories without querying products', async () => {
  const controller = load(async sql => {
    assert.doesNotMatch(sql, /eproducts|product_variants/);
    if (sql.includes('FROM categories c')) return [[{ category_id: 3, category_name: 'Accessories', cover_image: null }]];
    return [[{ category_id: 3, subcategory_id: 8, subcategory_name: 'Bags' }]];
  });
  const res = response(); await controller.catalogue(request(), res);
  assert.equal(res.code, 200); assert.equal(res.body.data[0].subcategories[0].subcategory_name, 'Bags');
});
test('subcategory must belong to the selected category', async () => {
  let inserted = false;
  const controller = load(async sql => {
    if (sql.includes('request_hash FROM')) return [[]];
    if (sql.includes('INSERT')) { inserted = true; return [{ insertId: 1 }]; }
    return [[{ category_id: 3, category_name: 'Accessories', subcategory_id: 9, subcategory_name: 'Other' }]];
  });
  const res = response(); await controller.create(request(), res);
  assert.equal(res.code, 400); assert.equal(inserted, false);
});
for (const subcategory_id of [8, null]) {
  test(`stores server-resolved category names with subcategory ${subcategory_id}`, async () => {
    let stored;
    const controller = load(async (sql, params) => {
      if (sql.includes('request_hash FROM')) return [[]];
      if (sql.includes('INSERT')) { assert.equal(params[0], 7); stored = JSON.parse(params[14]); return [{ insertId: 12 }]; }
      return [[{ category_id: 3, category_name: 'Accessories', subcategory_id: 8, subcategory_name: 'Bags' }]];
    });
    const data = body(); data.items[0].subcategory_id = subcategory_id;
    const res = response(); await controller.create(request(data), res);
    assert.equal(res.code, 201);
    assert.equal(stored[0].category_name, 'Accessories');
    assert.equal(stored[0].subcategory_name, subcategory_id ? 'Bags' : null);
    assert.equal(stored[0].preferred_brand, 'Brand preference');
  });
}
