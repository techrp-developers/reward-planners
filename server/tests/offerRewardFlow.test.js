const { test } = require('node:test');
const assert = require('node:assert/strict');
function mock(path, exports) { const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports }; }
let mode = 'normal';
let scope = 'product';
let writes = [];
let expireOnLock = false;
let permissions = 'both';
const active = () => ['flash', 'content'].includes(mode);
const row = () => ({
  product_id: 1, variant_id: 2, category_id: 3, subcategory_id: 4, vendor_id: 5,
  product_name: 'Test product', quantity: 2, cart_item_id: 10, is_discount_eligible: 1,
  mrp: 250, stock: 20, weight: 1, length: 10, breadth: 10, height: 10, sale_price: 200,
});
async function execute(sql, params = []) {
  // the order lock re-reads offers with FOR UPDATE; expire the offer at that point
  if (sql.includes('FOR UPDATE') && sql.includes('FROM campaign_items ci') && expireOnLock) mode = 'expired';
  if (/^\s*(INSERT|UPDATE|DELETE)/.test(sql)) {
    writes.push({ sql, params }); return [{ insertId: 100, affectedRows: 1 }];
  }
  if (sql.includes('FROM customer_wallet')) return [[{ balance: 1000 }]];
  if (sql.includes('FROM vendor_addresses')) return [[{ pincode: '560001' }]];
  if (sql.includes('FROM customer_addresses')) return [[{ zipcode: '560002' }]];
  if (sql.includes('SELECT quantity FROM cart_items')) return [[]];
  if (sql.includes('FROM campaign_items ci') && sql.includes('remaining_qty')) return [mode === 'flash' ? [{ variant_id: 2, campaign_id: 6, offer_price: 150, remaining_qty: 10 }] : []];
  if (sql.includes('FROM content_effective_product_offers o')) return [mode === 'content' ? [{ variant_id: 2, content_id: 7, offer_price: 150 }] : []];
  if (sql.includes('FROM cart_items') || sql.includes('FROM product_variants')) return [[row()]];
  throw new Error(`Unexpected SQL: ${sql}`);
}
const connection = { execute, query: execute, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
mock('../config/database', { execute, query: execute, getConnection: async () => connection });
mock('../app/common/models/addressModel', { getAddressById: async () => ({ zipcode: '560002' }) });
mock('../services/ExpressBees/xpressbees_service', { checkServiceability: async () => ({ status: true, data: [{ id: 1, name: 'Test courier', total_charges: 10, estimated_delivery_days: 3 }] }) });
mock('../services/rewards/ecommerceWalletService', { reserveWalletCoins: async (_connection, data) => { writes.push({ wallet: data }); } });
mock('../app/ecommerce/v1/utils/deliveryFeePolicy', { deliveryChargeForUser: ({ calculatedCharge }) => Number(calculatedCharge) });
const rewardRule = () => ({
  reward_rule_id: 1, is_active: 1, min_order_amount: 0, is_stackable: 0,
  target_rank: { product: 2, subcategory: 3, category: 4 }[scope],
  can_earn_reward: permissions === 'redeem' ? 0 : 1, can_redeem_reward: permissions === 'earn' ? 0 : 1,
  reward_type: 'percentage', reward_value: 10,
  redemption_type: 'percentage', redemption_value: 20,
});
mock('../models/rewardModel', { getProductRewards: async (product, variant, category, subcategory) => {
  assert.deepEqual([Number(product), Number(variant), Number(category), Number(subcategory)], [1, 2, 3, 4]);
  return [rewardRule()];
} });
mock('../app/ecommerce/v1/models/productModel', {
  getProductById: async () => ({ ...row(), variants: [{ variant_id: 2, sale_price: 200, mrp: 250 }] }),
});
const cart = require('../app/ecommerce/v1/models/cartModel');
const checkout = require('../app/ecommerce/v1/models/checkoutModel');
const productController = require('../app/ecommerce/v1/controllers/productController');
mock('../models/campaignModel', { getCampaignProducts: async () => [{ ...row(), final_price: 150, campaign_id: 6 }] });
mock('../models/contentZoneModel', {
  getImageTargetEntry: async () => ({ content_id: 7, module: 'product', zone: 'offers_banner', status: 'active', content_type: 'color' }),
  getContentProducts: async () => [{ ...row(), sale_price: 200, offer_price: active() ? 150 : null }],
});
const campaignController = require('../app/ecommerce/v1/controllers/campaignController');
const cmsController = require('../app/common/controller/cmsController');
const { calculateReward, resolveRedemption } = require('../app/ecommerce/v1/utils/rewardCalculate');
const response = () => ({ code: 200, json(payload) { this.payload = payload; return this; }, status(code) { this.code = code; return this; } });

for (const rewardScope of ['product', 'category', 'subcategory']) {
  for (const offerMode of ['normal', 'flash', 'content', 'expired']) {
    test(`${rewardScope} rewards: ${offerMode} product → cart → checkout → buy-now → order`, async () => {
      mode = offerMode; scope = rewardScope; writes = []; expireOnLock = false; permissions = 'both';
      const isOffer = active();
      const price = isOffer ? 150 : 200;
      const redeem = isOffer ? 0 : 80;
      const earn = isOffer ? 30 : 32;
      const total = price * 2 - redeem + 10;
      const res = response();
      // no campaign_id/content_id: the server finds the live offer itself
      await productController.getProductById({ params: { productId: 1 }, query: {} }, res);
      assert.equal(res.code, 200);
      const variant = res.payload.product.variants[0];
      assert.equal(variant.sale_price, price);
      assert.equal(variant.reward.coins, price / 10);
      assert.equal(variant.redemption.enabled, !isOffer);
      await cart.addToCart({ userId: 8, productId: 1, variantId: 2, quantity: 2, campaignId: 6, contentId: 7 });
      const cartWrite = writes.find(write => write.sql?.includes('INSERT INTO cart_items'));
      assert.deepEqual(cartWrite.params.slice(0, 4), [8, 1, 2, 2]);
      assert.equal((await cart.getUserCart(8)).items[0].sale_price, price);
      const summary = await cart.getCartSummary(8, true);
      assert.equal(summary.cartTotal, price * 2);
      assert.equal(summary.totalRedeemed, redeem);
      assert.equal(summary.totalRewardEarn, earn);
      const preview = await checkout.getCheckoutCart(8, true, 9);
      assert.equal(preview.productTotal, price * 2);
      assert.deepEqual(preview.reward, { earnCoins: earn, redeemCoins: redeem });
      assert.equal(preview.payableAmount, total);
      const input = { userId: 8, productId: 1, variantId: 2, quantity: 2, campaignId: 6, contentId: 7, addressId: 9, companyId: 1, useRewards: true, expectedTotal: total, expectedRedeemable: redeem };
      const buyPreview = await checkout.getBuyNowCheckout(input);
      assert.equal(buyPreview.payableAmount, total);
      assert.deepEqual(buyPreview.reward, { earnCoins: earn, redeemCoins: redeem });
      await checkout.buyNow(input);
      await checkout.checkoutCart(8, 1, 9, true, total, redeem);
      const orders = writes.filter(write => write.sql?.includes('INSERT INTO eorders'));
      assert.equal(orders.length, 2);
      for (const order of orders) {
        assert.equal(order.params[5], price * 2);
        assert.equal(order.params[6], redeem);
        assert.equal(order.params[8], earn);
      }
      for (const item of writes.filter(write => write.sql?.includes('INSERT INTO eorder_items'))) {
        assert.equal(Number(item.params[5]), price);
        assert.equal(item.params[8], earn);
      }
    });
  }
}

test('offer expiry between preview and order lock requires a fresh checkout', async () => {
  mode = 'flash'; expireOnLock = true; writes = [];
  await assert.rejects(checkout.buyNow({ userId: 8, productId: 1, variantId: 2, quantity: 2, campaignId: 6, addressId: 9, companyId: 1, expectedTotal: 310, expectedRedeemable: 0 }), /CHECKOUT_CHANGED/);
  assert.equal(writes.filter(write => write.sql?.includes('INSERT INTO eorders')).length, 0);
  expireOnLock = false;
});

test('redeem-only product mapping does not suppress category earning', () => {
  const rules = [{ ...rewardRule(), reward_rule_id: 2, target_rank: 2, can_earn_reward: 0 }, { ...rewardRule(), target_rank: 4, can_redeem_reward: 0 }];
  assert.equal(calculateReward(200, rules), 20);
  assert.equal(resolveRedemption(200, rules).value, 20);
});

test('CMS and flash-sale product listings keep earning and disable offer redemption', async () => {
  permissions = 'both'; mode = 'flash';
  const flash = response();
  await campaignController.getCampaignProducts({ params: { id: 6 } }, flash);
  assert.equal(flash.code, 200);
  assert.equal(flash.payload.data[0].reward.coins, 15);
  assert.equal(flash.payload.data[0].redeem_coins, 0);
  mode = 'content';
  const cms = response();
  await cmsController.getContentProducts({ params: { id: 7 }, query: {} }, cms);
  assert.equal(cms.code, 200);
  assert.equal(cms.payload.data.products[0].rewardCoins, 15);
  assert.equal(cms.payload.data.products[0].redeem_coins, 0);
});

test('earn-only, redeem-only and rewards-toggle behavior', async () => {
  mode = 'normal'; permissions = 'earn';
  let summary = await cart.getCartSummary(8, true);
  assert.equal(summary.totalRewardEarn, 40); assert.equal(summary.totalRedeemed, 0);
  permissions = 'redeem';
  summary = await cart.getCartSummary(8, true);
  assert.equal(summary.totalRewardEarn, 0); assert.equal(summary.totalRedeemed, 80);
  mode = 'content';
  summary = await cart.getCartSummary(8, true);
  assert.equal(summary.totalRewardEarn, 0); assert.equal(summary.totalRedeemed, 0);
  mode = 'normal'; permissions = 'both';
  summary = await cart.getCartSummary(8, false);
  assert.equal(summary.totalRewardEarn, 40); assert.equal(summary.totalRedeemed, 0);
});

test('checkout blocks tampered prices and offers expiring during cart checkout', async () => {
  mode = 'content'; permissions = 'both'; writes = [];
  await assert.rejects(checkout.buyNow({ userId: 8, productId: 1, variantId: 2, quantity: 2, contentId: 7, addressId: 9, expectedTotal: 1, expectedRedeemable: 0 }), /PRICE_MISMATCH/);
  expireOnLock = true;
  await assert.rejects(checkout.checkoutCart(8, 1, 9, true, 310, 0), /CHECKOUT_CHANGED/);
  assert.equal(writes.filter(write => write.sql?.includes('INSERT INTO eorders')).length, 0);
  expireOnLock = false;
});
