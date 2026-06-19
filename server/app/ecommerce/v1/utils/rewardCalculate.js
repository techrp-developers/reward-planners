function compareRewardRules(a, b) {
  return (
    Number(a.target_rank || 99) - Number(b.target_rank || 99) ||
    Number(b.min_order_amount || 0) - Number(a.min_order_amount || 0) ||
    Number(a.max_order_amount || Number.MAX_SAFE_INTEGER) -
      Number(b.max_order_amount || Number.MAX_SAFE_INTEGER) ||
    Number(a.mapping_priority || a.priority || 0) -
      Number(b.mapping_priority || b.priority || 0) ||
    Number(a.rule_priority || a.priority || 0) -
      Number(b.rule_priority || b.priority || 0)
  );
}

/* ===============================
   EARNING CALCULATION
=============================== */
function calculateReward(orderAmount, rules) {
  if (!rules || !rules.length) return 0;

  const now = new Date();

  const validRules = rules.filter((rule) => {
    if (!rule.is_active) return false;

    if (rule.start_date && new Date(rule.start_date) > now) return false;
    if (rule.end_date && new Date(rule.end_date) < now) return false;

    if (orderAmount < rule.min_order_amount) return false;
    if (rule.max_order_amount && orderAmount > rule.max_order_amount)
      return false;

    return true;
  });

  if (!validRules.length) return 0;

  const stackable = validRules.filter((r) => r.is_stackable);
  const nonStackable = validRules.filter((r) => !r.is_stackable);

  let applicable = [];

  if (nonStackable.length) {
    nonStackable.sort(compareRewardRules);
    applicable.push(nonStackable[0]);
  }

  applicable.push(...stackable.sort(compareRewardRules));

  const seen = new Set();
  applicable = applicable.filter((r) => {
    if (seen.has(r.reward_rule_id)) return false;
    seen.add(r.reward_rule_id);
    return true;
  });

  let total = 0;

  for (const rule of applicable) {
    if (!rule.can_earn_reward) continue;

    let reward = 0;

    if (rule.reward_type === "percentage") {
      reward = (orderAmount * rule.reward_value) / 100;
    } else {
      reward = rule.reward_value;
    }

    if (rule.max_reward) {
      reward = Math.min(reward, rule.max_reward);
    }

    total += Math.floor(reward);
  }

  return total;
}

function resolveRedemption(orderAmount, rules) {
  if (!rules || !rules.length) {
    return { type: null, value: 0, maxRedemptionAmount: null };
  }

  const now = new Date();

  const validRules = rules.filter((rule) => {
    if (!rule.is_active) return false;
    if (rule.start_date && new Date(rule.start_date) > now) return false;
    if (rule.end_date && new Date(rule.end_date) < now) return false;
    if (orderAmount < rule.min_order_amount) return false;
    if (rule.max_order_amount && orderAmount > rule.max_order_amount)
      return false;
    if (!rule.can_redeem_reward) return false;
    if (!rule.redemption_type || rule.redemption_value == null) return false;

    return true;
  });

  if (!validRules.length) {
    return { type: null, value: 0, maxRedemptionAmount: null };
  }

  const winner = validRules.sort(compareRewardRules)[0];

  return {
    type: winner.redemption_type,
    value: Number(winner.redemption_value),
    maxRedemptionAmount: winner.max_redemption_amount
      ? Number(winner.max_redemption_amount)
      : null,
  };
}

function calculateRedeemableCoins(orderAmount, redemption) {
  if (!redemption.value) return 0;

  let coins =
    redemption.type === "percentage"
      ? (orderAmount * redemption.value) / 100
      : redemption.value;

  if (redemption.maxRedemptionAmount) {
    coins = Math.min(coins, redemption.maxRedemptionAmount);
  }

  coins = Math.min(coins, orderAmount);

  return Math.floor(coins);
}

module.exports = {
  calculateReward,
  resolveRedemption,
  calculateRedeemableCoins,
};
