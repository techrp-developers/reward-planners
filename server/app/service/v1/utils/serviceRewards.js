function positiveMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function calculateServiceRewards(price, variant = {}) {
  const amount = positiveMoney(price);

  let earnCoins = 0;
  if (Number(variant.can_earn_reward) === 1) {
    earnCoins =
      variant.earn_reward_type === "percentage"
        ? (amount * positiveMoney(variant.earn_reward_value)) / 100
        : positiveMoney(variant.earn_reward_value);

    const cap = positiveMoney(variant.max_earn_reward);
    if (cap) earnCoins = Math.min(earnCoins, cap);
  }

  let maxRedeemCoins = 0;
  if (Number(variant.can_redeem_reward) === 1) {
    maxRedeemCoins =
      variant.redemption_type === "percentage"
        ? (amount * positiveMoney(variant.redemption_value)) / 100
        : positiveMoney(variant.redemption_value);

    const cap = positiveMoney(variant.max_redemption_amount);
    if (cap) maxRedeemCoins = Math.min(maxRedeemCoins, cap);
    maxRedeemCoins = Math.min(maxRedeemCoins, amount);
  }

  earnCoins = Math.floor(earnCoins);
  maxRedeemCoins = Math.floor(maxRedeemCoins);

  return {
    can_earn: earnCoins > 0,
    earn_coins: earnCoins,
    earn_type: variant.earn_reward_type || null,
    earn_value: positiveMoney(variant.earn_reward_value),
    can_redeem: maxRedeemCoins > 0,
    max_redeem_coins: maxRedeemCoins,
    redemption_type: variant.redemption_type || null,
    redemption_value: positiveMoney(variant.redemption_value),
  };
}

function attachServiceRewards(item) {
  return { ...item, rewards: calculateServiceRewards(item.price, item) };
}

function allocateRedeemedCoins(items, requestedCoins, walletBalance) {
  const requested = Math.max(0, Math.floor(Number(requestedCoins || 0)));
  const available = Math.max(0, Math.floor(Number(walletBalance || 0)));
  const maximum = items.reduce(
    (sum, item) => sum + Number(item.rewards?.max_redeem_coins || 0),
    0,
  );
  let remaining = Math.min(requested, available, maximum);

  const allocations = items.map((item) => {
    const limit = Number(item.rewards?.max_redeem_coins || 0);
    const coins = Math.min(remaining, limit);
    remaining -= coins;
    return { ...item, redeem_coins: coins, final_price: Number(item.price) - coins };
  });

  return {
    items: allocations,
    requested_coins: requested,
    wallet_balance: available,
    max_redeem_coins: maximum,
    redeem_coins: allocations.reduce((sum, item) => sum + item.redeem_coins, 0),
  };
}

async function creditCompletedServiceReward(db, orderId) {
  const { addWalletAdjustment } = require("../../../../services/rewards/ecommerceWalletService");
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.execute(
      `SELECT id, user_id, status, reward_coins_earned
       FROM service_orders WHERE id = ? FOR UPDATE`,
      [orderId],
    );

    if (!order || order.status !== "completed") {
      await conn.rollback();
      return false;
    }

    const credited = await addWalletAdjustment(conn, {
      userId: order.user_id,
      coins: order.reward_coins_earned,
      orderId: order.id,
      referenceId: order.id,
      transactionType: "credit",
      reasonCode: "SERVICE_REWARD",
      title: "Coins earned from completed service",
      description: `Earned ${Number(order.reward_coins_earned || 0)} coins`,
    });
    await conn.commit();
    return credited;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  calculateServiceRewards,
  attachServiceRewards,
  allocateRedeemedCoins,
  creditCompletedServiceReward,
};
