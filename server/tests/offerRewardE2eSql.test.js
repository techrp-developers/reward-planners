const { test } = require('node:test');
const assert = require('node:assert/strict');

// Real-DB end-to-end: runs the real controllers/models against the local schema inside one
// transaction that is always rolled back. Only the courier API is stubbed.
test('real DB: rewards + flash/content offers across product → cart → checkout → buy-now → order', { skip: process.env.RUN_OFFER_REWARD_SQL_TEST !== '1' }, async (t) => {
  const dbPath = require.resolve('../config/database');
  const pool = require(dbPath);
  const conn = await pool.getConnection();
  const shared = {
    execute: (...a) => conn.execute(...a), query: (...a) => conn.query(...a),
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
  };
  require.cache[dbPath].exports = { ...shared, getConnection: async () => shared };
  const courierPath = require.resolve('../services/ExpressBees/xpressbees_service');
  require.cache[courierPath] = { id: courierPath, filename: courierPath, loaded: true, exports: {
    checkServiceability: async () => ({ status: true, data: [{ id: 1, name: 'Test courier', total_charges: 10, chargeable_weight: 2000, estimated_delivery_days: 3 }] }),
  } };
  const q = async (sql, params = []) => (await conn.query(sql, params))[0];
  await conn.beginTransaction();
  try {
    const [address] = await q('SELECT address_id, user_id FROM customer_addresses ORDER BY address_id LIMIT 1');
    const [vendor] = await q("SELECT vendor_id FROM vendor_addresses WHERE type = 'shipping' ORDER BY vendor_id LIMIT 1");
    assert.ok(address && vendor, 'needs a customer address and a vendor shipping address');
    const userId = address.user_id; const addressId = address.address_id;
    const categoryId = (await q("INSERT INTO categories (category_name) VALUES ('__offer_e2e_cat')")).insertId;
    const subcategoryId = (await q("INSERT INTO sub_categories (category_id, subcategory_name) VALUES (?, '__offer_e2e_sub')", [categoryId])).insertId;
    const productId = (await q("INSERT INTO eproducts (vendor_id, category_id, subcategory_id, product_name, is_discount_eligible, status, is_deleted, is_visible) VALUES (?, ?, ?, '__offer_e2e_product', 1, 'approved', 0, 1)", [vendor.vendor_id, categoryId, subcategoryId])).insertId;
    const variantId = (await q("INSERT INTO product_variants (product_id, sku, variant_attributes, mrp, sale_price, stock, weight, length, breadth, height) VALUES (?, '__offer_e2e_sku', '{}', 250, 200, 50, 1, 10, 10, 10)", [productId])).insertId;
    const campaignId = (await q("INSERT INTO campaigns (title, campaign_type, status, start_at, end_at) VALUES ('__offer_e2e_flash', 'flash_sale', 'active', NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 1 DAY)")).insertId;
    await q('INSERT INTO campaign_items (campaign_id, product_id, variant_id, offer_price, max_qty, sold_qty) VALUES (?, ?, ?, 150, 100, 0)', [campaignId, productId, variantId]);
    const contentId = (await q("INSERT INTO content_zone_entries (module, zone, content_type, title, target_type, target_id, is_published, start_at, end_at) VALUES ('product', 'offers_banner', 'color', '__offer_e2e_banner', 'product', ?, 1, NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 1 DAY)", [productId])).insertId;
    await q('INSERT INTO content_product_offers (content_id, product_id, variant_id, offer_price) VALUES (?, ?, ?, 160)', [contentId, productId, variantId]);
    const ruleId = (await q("INSERT INTO reward_rules (name, reward_type, reward_value, redemption_type, redemption_value, min_order_amount, is_active, source_type, priority, is_stackable) VALUES ('__offer_e2e_rule', 'percentage', 10, 'percentage', 20, 0, 1, 'ecommerce', 1, 0)")).insertId;
    // Isolate from existing reward mappings; everything is rolled back afterwards.
    await q('UPDATE product_reward_settings SET is_active = 0');
    await q('DELETE FROM cart_items WHERE user_id = ?', [userId]);
    await q('INSERT INTO customer_wallet (user_id, balance) VALUES (?, 1000) ON DUPLICATE KEY UPDATE balance = 1000', [userId]);

    const productController = require('../app/ecommerce/v1/controllers/productController');
    const campaignController = require('../app/ecommerce/v1/controllers/campaignController');
    const cmsController = require('../app/common/controller/cmsController');
    const cart = require('../app/ecommerce/v1/models/cartModel');
    const checkout = require('../app/ecommerce/v1/models/checkoutModel');
    const response = () => ({ code: 200, json(p) { this.payload = p; return this; }, status(c) { this.code = c; return this; } });
    const shipping = 10;

    const scopes = { product: [productId, null, null], category: [null, categoryId, null], subcategory: [null, null, subcategoryId], none: null };
    const expire = (table, key, id) => q(`UPDATE ${table} SET end_at = NOW() - INTERVAL 1 SECOND WHERE ${key} = ?`, [id]);
    const expireFlash = () => expire('campaigns', 'campaign_id', campaignId);
    const expireBanner = () => expire('content_zone_entries', 'content_id', contentId);
    const soldOut = () => q('UPDATE campaign_items SET sold_qty = max_qty WHERE campaign_id = ?', [campaignId]);
    // flash 150 and banner 160 both live; no offer ids are ever passed — the server picks the price
    const resetOffers = async () => {
      await q('UPDATE campaigns SET end_at = NOW() + INTERVAL 1 DAY WHERE campaign_id = ?', [campaignId]);
      await q('UPDATE campaign_items SET sold_qty = 0, max_qty = 100 WHERE campaign_id = ?', [campaignId]);
      await q("UPDATE content_zone_entries SET zone = 'offers_banner', end_at = NOW() + INTERVAL 1 DAY WHERE content_id = ?", [contentId]);
      await q('UPDATE content_product_offers SET offer_price = 160 WHERE content_id = ?', [contentId]);
    };
    const offers = {
      noOffer: { price: 200, redeemable: true, before: async () => { await expireFlash(); await expireBanner(); } },
      flash: { price: 150, redeemable: false, before: expireBanner },
      flashExpired: { price: 200, redeemable: true, before: async () => { await expireBanner(); await expireFlash(); } },
      flashSoldOut: { price: 200, redeemable: true, before: async () => { await expireBanner(); await soldOut(); } },
      flashSoldOutBannerLive: { price: 160, redeemable: false, before: soldOut },
      bothLiveFlashCheaper: { price: 150, redeemable: false },
      bothLiveBannerCheaper: { price: 140, redeemable: false, before: () => q('UPDATE content_product_offers SET offer_price = 140 WHERE content_id = ?', [contentId]) },
    };
    for (const zone of ['promotional_banner', 'offers_banner', 'brand_promotional_banner']) {
      const before = async () => { await expireFlash(); await q('UPDATE content_zone_entries SET zone = ? WHERE content_id = ?', [zone, contentId]); };
      offers[zone] = { price: 160, redeemable: false, before };
      offers[`${zone}Expired`] = { price: 200, redeemable: true, before: async () => { await before(); await expireBanner(); } };
    }

    for (const [scope, mapping] of Object.entries(scopes)) {
      await q('DELETE FROM product_reward_settings WHERE reward_rule_id = ?', [ruleId]);
      if (mapping) await q('INSERT INTO product_reward_settings (reward_rule_id, product_id, category_id, subcategory_id, can_earn_reward, can_redeem_reward, is_active, priority) VALUES (?, ?, ?, ?, 1, 1, 1, 1)', [ruleId, ...mapping]);
      for (const [name, offer] of Object.entries(offers)) {
        await t.test(`${scope} reward, ${name}`, async () => {
          await q('UPDATE product_variants SET stock = 50 WHERE variant_id = ?', [variantId]);
          await resetOffers();
          if (offer.before) await offer.before();
          const { price } = offer; const qty = 2; const lineTotal = price * qty;
          const redeemable = offer.redeemable && Boolean(mapping);
          const redeem = redeemable ? lineTotal * 0.2 : 0;
          const earn = mapping ? Math.floor((lineTotal - redeem) * 0.1) : 0;
          const total = lineTotal - redeem + shipping;

          const res = response();
          await productController.getProductById({ params: { productId }, query: {} }, res);
          assert.equal(res.code, 200, JSON.stringify(res.payload));
          const variant = res.payload.product.variants.find(v => Number(v.variant_id) === variantId);
          assert.equal(variant.sale_price, price, 'product page price');
          assert.equal(variant.reward.coins, mapping ? Math.floor(price * 0.1) : 0, 'product page earn');
          assert.equal(variant.redemption.enabled, redeemable, 'product page redemption');

          await q('DELETE FROM cart_items WHERE user_id = ?', [userId]);
          await cart.addToCart({ userId, productId, variantId, quantity: qty });
          assert.equal((await cart.getUserCart(userId)).items[0].sale_price, price, 'cart price');
          const summary = await cart.getCartSummary(userId, true);
          assert.deepEqual([summary.cartTotal, summary.totalRedeemed, summary.totalRewardEarn], [lineTotal, redeem, earn], 'cart summary');

          const preview = await checkout.getCheckoutCart(userId, true, addressId);
          assert.equal(preview.productTotal, lineTotal);
          assert.deepEqual(preview.reward, { earnCoins: earn, redeemCoins: redeem });
          assert.equal(preview.payableAmount, total, 'cart checkout payable');

          const input = { userId, productId, variantId, quantity: qty, addressId, companyId: 1, useRewards: true, expectedTotal: total, expectedRedeemable: redeem };
          const buyPreview = await checkout.getBuyNowCheckout(input);
          assert.equal(buyPreview.payableAmount, total, 'buy-now payable');
          assert.deepEqual(buyPreview.reward, { earnCoins: earn, redeemCoins: redeem });

          await q('UPDATE customer_wallet SET balance = 1000 WHERE user_id = ?', [userId]);
          const buyNowOrder = await checkout.buyNow(input);
          await q('UPDATE customer_wallet SET balance = 1000 WHERE user_id = ?', [userId]);
          const cartOrder = await checkout.checkoutCart(userId, 1, addressId, true, total, redeem);
          for (const orderId of [buyNowOrder, cartOrder]) {
            const [order] = await q('SELECT product_total, reward_discount, reward_coins_earned, total_amount FROM eorders WHERE order_id = ?', [orderId]);
            assert.deepEqual([Number(order.product_total), Number(order.reward_discount), Number(order.reward_coins_earned), Number(order.total_amount)], [lineTotal, redeem, earn, total], `order ${orderId}`);
            const [item] = await q('SELECT price, reward_coins_used, reward_coins_earned FROM eorder_items WHERE order_id = ?', [orderId]);
            assert.deepEqual([Number(item.price), Number(item.reward_coins_used), Number(item.reward_coins_earned)], [price, redeem, earn], `order item ${orderId}`);
          }
          assert.equal((await q('SELECT COUNT(*) n FROM cart_items WHERE user_id = ?', [userId]))[0].n, 0, 'cart cleared');
        });
      }
    }

    await t.test('flash and banner listings show offer price, earning only', async () => {
      await q('INSERT INTO product_reward_settings (reward_rule_id, product_id, can_earn_reward, can_redeem_reward, is_active, priority) VALUES (?, ?, 1, 1, 1, 1)', [ruleId, productId]);
      await q('UPDATE product_variants SET stock = 50 WHERE variant_id = ?', [variantId]);
      await resetOffers();
      const flash = response();
      await campaignController.getCampaignProducts({ params: { id: campaignId }, query: {} }, flash);
      assert.equal(flash.code, 200, JSON.stringify(flash.payload));
      const flashItem = flash.payload.data.find(p => Number(p.variant_id) === variantId);
      assert.ok(flashItem, 'flash listing contains product');
      assert.equal(Number(flashItem.final_price ?? flashItem.offer_price), 150);
      assert.equal(flashItem.reward.coins, 15);
      assert.equal(flashItem.redeem_coins, 0);
      const cms = response();
      await cmsController.getContentProducts({ params: { id: contentId }, query: {} }, cms);
      assert.equal(cms.code, 200, JSON.stringify(cms.payload));
      const cmsItem = cms.payload.data.products.find(p => Number(p.product_id) === productId);
      assert.ok(cmsItem, 'banner listing contains product');
      assert.equal(Number(cmsItem.offer_price), 150, 'banner listing shows the lower live flash price');
      assert.equal(cmsItem.rewardCoins, 15);
      assert.equal(cmsItem.redeem_coins, 0);
    });

    await t.test('offer expiring after cart add falls back to default price and re-enables redemption', async () => {
      await q('DELETE FROM cart_items WHERE user_id = ?', [userId]);
      await cart.addToCart({ userId, productId, variantId, quantity: 2 });
      assert.equal((await cart.getCartSummary(userId, true)).cartTotal, 300);
      await expireFlash();
      assert.equal((await cart.getCartSummary(userId, true)).cartTotal, 320, 'falls back to the banner offer');
      await expireBanner();
      const summary = await cart.getCartSummary(userId, true);
      assert.deepEqual([summary.cartTotal, summary.totalRedeemed, summary.totalRewardEarn], [400, 80, 32]);
      assert.equal((await checkout.getCheckoutCart(userId, true, addressId)).payableAmount, 330);
    });

    await t.test('flash sale limit: orders reserve sold_qty, over-limit is refused or falls back, expiry releases it', async () => {
      const { expirePendingOrder } = require('../services/Razorpay/orderExpiryService');
      const soldQty = async () => Number((await q('SELECT sold_qty FROM campaign_items WHERE campaign_id = ? AND variant_id = ?', [campaignId, variantId]))[0].sold_qty);
      await q('UPDATE product_variants SET stock = 50 WHERE variant_id = ?', [variantId]);
      await q('UPDATE campaigns SET end_at = NOW() + INTERVAL 1 DAY WHERE campaign_id = ?', [campaignId]);
      await resetOffers();
      await expireBanner();
      await q('UPDATE campaign_items SET sold_qty = 0, max_qty = 3 WHERE campaign_id = ?', [campaignId]);
      await q('DELETE FROM cart_items WHERE user_id = ?', [userId]);
      await q('UPDATE customer_wallet SET balance = 1000 WHERE user_id = ?', [userId]);

      // buy-now of 2 at flash price reserves 2 of 3
      const buy = { userId, productId, variantId, quantity: 2, campaignId, contentId: null, addressId, companyId: 1, useRewards: true, expectedTotal: 310, expectedRedeemable: 0 };
      assert.equal((await checkout.getBuyNowCheckout(buy)).payableAmount, 310);
      const orderId = await checkout.buyNow(buy);
      assert.equal(await soldQty(), 2);
      const [orderItem] = await q('SELECT flash_sale_campaign_id, price FROM eorder_items WHERE order_id = ?', [orderId]);
      assert.deepEqual([Number(orderItem.flash_sale_campaign_id), Number(orderItem.price)], [campaignId, 150]);

      // only 1 left: adding 2 from the flash page is refused; buy-now of 2 previews at normal price
      await assert.rejects(cart.addToCart({ userId, productId, variantId, quantity: 2, campaignId }), /FLASH_SALE_LIMIT_EXCEEDED/);
      const fallback = await checkout.getBuyNowCheckout({ ...buy });
      assert.deepEqual([fallback.productTotal, fallback.reward.redeemCoins], [400, 80]);
      // 1 still fits; raising the cart line to 2 is refused
      await cart.addToCart({ userId, productId, variantId, quantity: 1, campaignId });
      const [cartItem] = await q('SELECT cart_item_id FROM cart_items WHERE user_id = ?', [userId]);
      await assert.rejects(cart.updateCartItem({ userId, cartItemId: cartItem.cart_item_id, quantity: 2 }), /FLASH_SALE_LIMIT_EXCEEDED/);
      assert.equal((await cart.getCartSummary(userId, true)).cartTotal, 150);

      // the last unit sells through cart checkout → limit reached → flash price gone everywhere
      await checkout.checkoutCart(userId, 1, addressId, true, 160, 0);
      assert.equal(await soldQty(), 3);
      const page = response();
      await productController.getProductById({ params: { productId }, query: { campaign_id: campaignId } }, page);
      assert.equal(page.payload.product.variants.find(v => Number(v.variant_id) === variantId).sale_price, 200);

      // a cart that saw the flash price before someone else took the last unit cannot be charged it
      await q('UPDATE campaign_items SET sold_qty = 2 WHERE campaign_id = ?', [campaignId]);
      await cart.addToCart({ userId, productId, variantId, quantity: 1, campaignId });
      await q('UPDATE campaign_items SET sold_qty = 3 WHERE campaign_id = ?', [campaignId]);
      await assert.rejects(checkout.checkoutCart(userId, 1, addressId, true, 160, 0), /PRICE_MISMATCH/);
      const guard = await q('UPDATE campaign_items SET sold_qty = sold_qty + 1 WHERE campaign_id = ? AND variant_id = ? AND max_qty - COALESCE(sold_qty, 0) >= 1', [campaignId, variantId]);
      assert.equal(guard.affectedRows, 0, 'reservation guard refuses beyond max_qty');
      assert.equal(await soldQty(), 3);
      await q('DELETE FROM cart_items WHERE user_id = ?', [userId]);

      // unpaid order expiry gives the 2 units back to the flash sale
      assert.equal(await expirePendingOrder(conn, orderId), true);
      assert.equal(await soldQty(), 1);
      assert.equal(await expirePendingOrder(conn, orderId), false, 'expiry is idempotent');
      assert.equal(await soldQty(), 1);

      // item cancellation release (same SQL as itemCancellationModel.approve)
      const [paidItem] = await q('SELECT oi.order_item_id FROM eorder_items oi JOIN eorders o ON o.order_id = oi.order_id WHERE oi.flash_sale_campaign_id = ? AND o.order_id <> ? ORDER BY oi.order_item_id DESC LIMIT 1', [campaignId, orderId]);
      const cancellationSrc = require('fs').readFileSync(require.resolve('../models/itemCancellationModel'), 'utf8');
      const releaseSql = cancellationSrc.match(/`(UPDATE campaign_items csi[\s\S]*?)`/)[1];
      await q(releaseSql, [paidItem.order_item_id]);
      assert.equal(await soldQty(), 0);
    });
  } finally {
    await conn.rollback();
    conn.release();
    await pool.end();
  }
});
