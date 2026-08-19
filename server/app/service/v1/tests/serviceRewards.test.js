const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateServiceRewards,
  allocateRedeemedCoins,
} = require("../utils/serviceRewards");

test("fixed service rewards use configured earn and redeem values", () => {
  const rewards = calculateServiceRewards(1800, {
    can_earn_reward: 1,
    earn_reward_type: "fixed",
    earn_reward_value: 100,
    can_redeem_reward: 1,
    redemption_type: "fixed",
    redemption_value: 320,
  });
  assert.equal(rewards.earn_coins, 100);
  assert.equal(rewards.max_redeem_coins, 320);
});

test("redemption is capped by request, wallet, and configured service maximum", () => {
  const item = {
    price: 1800,
    rewards: { max_redeem_coins: 320 },
  };
  assert.equal(allocateRedeemedCoins([item], 500, 1000).redeem_coins, 320);
  assert.equal(allocateRedeemedCoins([item], 300, 200).redeem_coins, 200);
});

test("redemption is allocated across multiple services without exceeding wallet", () => {
  const items = [
    { price: 1000, rewards: { max_redeem_coins: 250 } },
    { price: 500, rewards: { max_redeem_coins: 100 } },
  ];
  const quote = allocateRedeemedCoins(items, 350, 300);
  assert.equal(quote.redeem_coins, 300);
  assert.deepEqual(quote.items.map((item) => item.redeem_coins), [250, 50]);
});
