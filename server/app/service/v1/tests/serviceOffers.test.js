const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const rewards = require("../utils/serviceRewards");
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(require.resolve("../utils/serviceOffers"), "utf8"), {
  module: moduleStub,
  require: (name) => {
    if (name === "./serviceRewards") return rewards;
    if (name === "../../../../config/database") return {};
    throw new Error(`Unexpected dependency ${name}`);
  },
});
const { serviceOfferRewards, splitBundleOffer } = moduleStub.exports;
const variant = {
  can_earn_reward: 1, earn_reward_type: "percentage", earn_reward_value: 10,
  can_redeem_reward: 1, redemption_type: "percentage", redemption_value: 20,
};

test("CMS service offer earns on offer price and cannot redeem even when requested", () => {
  const item = { price: 800, rewards: serviceOfferRewards(800, variant, true) };
  assert.equal(item.rewards.earn_coins, 80);
  assert.equal(item.rewards.can_redeem, false);
  assert.equal(rewards.allocateRedeemedCoins([item], 999, 999).redeem_coins, 0);
  assert.equal(variant.can_redeem_reward, 1);
});

test("CMS bundle offer keeps earning for all items and blocks redemption", () => {
  const items = Array.from(splitBundleOffer([1000, 500], 1200), (price) => ({
    price, rewards: serviceOfferRewards(price, variant, true),
  }));
  assert.equal(items.reduce((sum, item) => sum + item.rewards.earn_coins, 0), 120);
  assert.equal(rewards.allocateRedeemedCoins(items, 999, 999).redeem_coins, 0);
});

test("regular or expired offers retain configured earning and redemption", () => {
  const item = { price: 1000, rewards: serviceOfferRewards(1000, variant, false) };
  assert.equal(item.rewards.earn_coins, 100);
  assert.equal(item.rewards.can_redeem, true);
  assert.equal(rewards.allocateRedeemedCoins([item], 999, 999).redeem_coins, 200);
});

test("mixed cart redeems only against regular services", () => {
  const items = [true, false].map((isOffer) => ({ price: 1000, rewards: serviceOfferRewards(1000, variant, isOffer) }));
  const quote = rewards.allocateRedeemedCoins(items, 999, 999);
  assert.deepEqual(quote.items.map((item) => item.redeem_coins), [0, 200]);
});
