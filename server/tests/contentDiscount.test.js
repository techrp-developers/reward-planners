const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateDiscount } = require('../utils/contentDiscount');

test('discount rules accept percentages, fixed amounts, and disabling the shared rule', () => {
  assert.deepEqual(validateDiscount('percentage', '10'), { discount_type: 'percentage', discount_value: 10 });
  assert.deepEqual(validateDiscount('fixed', 10), { discount_type: 'fixed', discount_value: 10 });
  assert.deepEqual(validateDiscount('none', 10), { discount_type: 'none', discount_value: 0 });
  for (const [type, value] of [['percentage', 101], ['fixed', -1], ['fixed', 0], ['fixed', Infinity], ['fixed', 1.234], ['bogus', 10], ['percentage', 'abc']]) {
    assert.throws(() => validateDiscount(type, value), error => error.statusCode === 400);
  }
});

// Optional local integration: runs the migration's pricing SELECT against temporary
// tables only. It does not migrate or modify application tables.
test('SQL pricing applies rules dynamically, respects image targets and individual overrides', { skip: process.env.RUN_CONTENT_DISCOUNT_SQL_TEST !== '1' }, async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const db = require('../config/database');
  const connection = await db.getConnection();
  const names = ['content_zone_entries', 'content_zone_entry_images', 'content_product_offers', 'eproducts', 'product_variants'];
  try {
    await connection.query(`CREATE TEMPORARY TABLE test_discount_entries (content_id INT, module VARCHAR(30), zone VARCHAR(40), target_type VARCHAR(30), target_id INT, target_ids TEXT, discount_type VARCHAR(20), discount_value DECIMAL(12,2))`);
    await connection.query(`CREATE TEMPORARY TABLE test_discount_images (content_id INT, is_active INT, target_type VARCHAR(30), target_id INT, target_ids TEXT)`);
    await connection.query(`CREATE TEMPORARY TABLE test_discount_overrides (content_id INT, product_id INT, variant_id INT, offer_price DECIMAL(12,2))`);
    await connection.query(`CREATE TEMPORARY TABLE test_discount_products (product_id INT, category_id INT, subcategory_id INT, is_deleted INT)`);
    await connection.query(`CREATE TEMPORARY TABLE test_discount_variants (product_id INT, variant_id INT, sale_price DECIMAL(12,2))`);
    const tables = ['test_discount_entries', 'test_discount_images', 'test_discount_overrides', 'test_discount_products', 'test_discount_variants'];
    let sql = fs.readFileSync(path.join(__dirname, '../migrations/20261022_content_discount_rules.sql'), 'utf8').split('CREATE OR REPLACE VIEW content_effective_product_offers AS')[1];
    names.forEach((name, index) => { sql = sql.replaceAll(name, tables[index]); });
    await connection.query("INSERT INTO test_discount_entries VALUES (1,'product','offers_banner','category',3,NULL,'percentage',10)");
    await connection.query('INSERT INTO test_discount_products VALUES (7,3,1,0),(8,4,2,0),(9,5,3,0)');
    await connection.query('INSERT INTO test_discount_variants VALUES (7,70,200),(8,80,100),(9,90,100)');
    const prices = async () => Object.fromEntries((await connection.query(sql))[0].map(row => [row.variant_id, Number(row.offer_price)]));
    assert.deepEqual(await prices(), { 70: 180 });
    await connection.query("INSERT INTO test_discount_images VALUES (1,1,'product',8,'[8]')");
    assert.deepEqual(await prices(), { 70: 180, 80: 90 });
    await connection.query('INSERT INTO test_discount_overrides VALUES (1,7,70,150)');
    assert.deepEqual(await prices(), { 70: 150, 80: 90 });
    await connection.query("UPDATE test_discount_entries SET discount_type='fixed', discount_value=10");
    assert.deepEqual(await prices(), { 70: 150, 80: 90 });
    await connection.query('DELETE FROM test_discount_overrides');
    assert.deepEqual(await prices(), { 70: 190, 80: 90 });
    await connection.query('UPDATE test_discount_variants SET sale_price=300 WHERE variant_id=70');
    assert.deepEqual(await prices(), { 70: 290, 80: 90 });
    await connection.query('UPDATE test_discount_products SET category_id=3 WHERE product_id=9');
    assert.deepEqual(await prices(), { 70: 290, 80: 90, 90: 90 });
    await connection.query('UPDATE test_discount_images SET is_active=0');
    assert.deepEqual(await prices(), { 70: 290, 90: 90 });
    await connection.query('UPDATE test_discount_entries SET discount_value=400');
    assert.deepEqual(await prices(), { 70: 0.01, 90: 0.01 });
    await connection.query("UPDATE test_discount_entries SET discount_type='none'");
    assert.deepEqual(await prices(), {});
    await connection.query("UPDATE test_discount_entries SET target_type='subcategory', target_id=2, discount_type='percentage', discount_value=10");
    assert.deepEqual(await prices(), { 80: 90 });
    await connection.query("UPDATE test_discount_entries SET target_type='product', target_id=7, target_ids='[7,9]'");
    assert.deepEqual(await prices(), { 70: 270, 90: 90 });
  } finally {
    for (const table of ['test_discount_entries', 'test_discount_images', 'test_discount_overrides', 'test_discount_products', 'test_discount_variants']) await connection.query(`DROP TEMPORARY TABLE IF EXISTS ${table}`);
    connection.release();
    await db.end();
  }
});
