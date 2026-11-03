const { test } = require('node:test');
const assert = require('node:assert/strict');

test('real SQL expires offers and resolves product/category/subcategory reward mappings', { skip: process.env.RUN_OFFER_REWARD_SQL_TEST !== '1' }, async () => {
  const dbPath = require.resolve('../config/database');
  const db = require(dbPath);
  const connection = await db.getConnection();
  const tables = ['campaigns', 'campaign_items', 'content_zone_entries', 'content_effective_product_offers', 'product_reward_settings', 'reward_rules'];
  const originalDb = require.cache[dbPath].exports;
  require.cache[dbPath].exports = { execute: (...args) => connection.execute(...args), query: (...args) => connection.query(...args) };
  try {
    await connection.query('CREATE TEMPORARY TABLE campaigns (campaign_id INT, campaign_type VARCHAR(30), status VARCHAR(30), start_at DATETIME, end_at DATETIME)');
    await connection.query('CREATE TEMPORARY TABLE campaign_items (campaign_id INT, product_id INT, variant_id INT, offer_price DECIMAL(12,2), max_qty INT, sold_qty INT)');
    await connection.query('CREATE TEMPORARY TABLE content_zone_entries (content_id INT, module VARCHAR(30), zone VARCHAR(40), is_published INT, start_at DATETIME, end_at DATETIME)');
    await connection.query('CREATE TEMPORARY TABLE content_effective_product_offers (content_id INT, product_id INT, variant_id INT, offer_price DECIMAL(12,2))');
    await connection.query('CREATE TEMPORARY TABLE product_reward_settings (reward_rule_id INT, variant_id INT, product_id INT, category_id INT, subcategory_id INT, priority INT, is_active INT, can_earn_reward INT, can_redeem_reward INT)');
    await connection.query('CREATE TEMPORARY TABLE reward_rules (reward_rule_id INT, is_active INT, priority INT, min_order_amount DECIMAL(12,2), max_order_amount DECIMAL(12,2), start_date DATETIME, end_date DATETIME, reward_type VARCHAR(20), reward_value INT, redemption_type VARCHAR(20), redemption_value INT, is_stackable INT)');
    const product = require('../app/ecommerce/v1/models/productModel');
    const rewards = require('../models/rewardModel');
    const { calculateReward, resolveRedemption } = require('../app/ecommerce/v1/utils/rewardCalculate');
    await connection.query("INSERT INTO campaigns VALUES (6,'flash_sale','active',NOW()-INTERVAL 1 DAY,NOW()+INTERVAL 1 DAY)");
    await connection.query('INSERT INTO campaign_items VALUES (6,1,2,150,10,0)');
    assert.equal((await product.getActiveCampaignOfferPrices(6, 1)).get(2), 150);
    await connection.query('UPDATE campaigns SET end_at=NOW()-INTERVAL 1 SECOND');
    assert.equal((await product.getActiveCampaignOfferPrices(6, 1)).size, 0);
    await connection.query("INSERT INTO content_zone_entries VALUES (7,'product','offers_banner',1,NOW()-INTERVAL 1 DAY,NOW()+INTERVAL 1 DAY)");
    await connection.query('INSERT INTO content_effective_product_offers VALUES (7,1,2,140)');
    assert.equal((await product.getActiveContentOfferPrices(7, 1)).get(2), 140);
    await connection.query('UPDATE content_zone_entries SET end_at=NOW()-INTERVAL 1 SECOND');
    assert.equal((await product.getActiveContentOfferPrices(7, 1)).size, 0);
    await connection.query('UPDATE content_zone_entries SET end_at=NULL, is_published=0');
    assert.equal((await product.getActiveContentOfferPrices(7, 1)).size, 0);
    await connection.query("INSERT INTO reward_rules VALUES (1,1,1,0,NULL,NULL,NULL,'percentage',10,'percentage',20,0)");
    for (const [productId, category, subcategory, rank] of [[1, null, null, 2], [null, 3, null, 4], [null, null, 4, 3]]) {
      await connection.query('DELETE FROM product_reward_settings');
      await connection.query('INSERT INTO product_reward_settings VALUES (1,NULL,?,?,?,1,1,1,1)', [productId, category, subcategory]);
      const rules = await rewards.getProductRewards(1, 2, 3, 4, 150, true);
      assert.equal(rules.length, 1);
      assert.equal(rules[0].target_rank, rank);
      assert.equal(calculateReward(150, rules), 15);
      assert.equal(resolveRedemption(150, rules).value, 20);
    }
  } finally {
    for (const table of tables) await connection.query(`DROP TEMPORARY TABLE IF EXISTS ${table}`);
    require.cache[dbPath].exports = originalDb;
    connection.release();
    await db.end();
  }
});
