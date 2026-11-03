const db = require("../../config/database");
const { MODULES, rewardForAmount } = require("./transactionRewardPolicy");
const { notifyUserAndWait } = require("../../app/common/utils/notification");
const { enqueueWhatsApp } = require("../whatsapp/waEnqueueService");

const SOURCES = {
  bbps: { table: "bbps_transactions", success: "bbps_status = 'PAID'", label: "BBPS payment" },
  busbooking: { table: "busbooking_orders", success: "status = 'confirmed' AND payment_status = 'paid'", label: "bus booking" },
};

async function creditTransactionReward(module, referenceId) {
  const source = SOURCES[module];
  if (!source) throw new Error("Invalid reward module");
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // Lock the source row so concurrent app, webhook and recovery jobs serialize.
    const [[order]] = await conn.execute(`SELECT id, user_id, created_at FROM ${source.table}
      WHERE id = ? AND ${source.success} FOR UPDATE`, [referenceId]);
    if (!order) { await conn.rollback(); return null; }
    const [[existing]] = await conn.execute("SELECT id FROM transaction_reward_awards WHERE module = ? AND reference_id = ?", [module, referenceId]);
    if (existing) { await conn.commit(); return existing.id; }
    // The first save enables rewards prospectively; historical orders are excluded.
    const [[settings]] = await conn.execute(`SELECT ranges_json, expiry_days FROM transaction_reward_settings
      WHERE module = ? AND created_at <= ?`, [module, order.created_at]);
    if (!settings) { await conn.rollback(); return null; }
    // Use the gateway's captured amount, not the price before redeemed coins.
    const [[payment]] = await conn.execute(`SELECT amount FROM razorpay_orders
      WHERE module = ? AND ref_id = ? AND status = 'success' ORDER BY id DESC LIMIT 1`, [module, referenceId]);
    if (!payment) { await conn.rollback(); return null; }
    const ranges = typeof settings.ranges_json === "string" ? JSON.parse(settings.ranges_json) : settings.ranges_json;
    const points = rewardForAmount(ranges, payment.amount);
    const [award] = await conn.execute(`INSERT INTO transaction_reward_awards
      (module, reference_id, user_id, paid_amount, points, notification_sent, whatsapp_queued)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [module, referenceId, order.user_id, payment.amount, points, points ? 0 : 1, points ? 0 : 1]);
    if (points > 0) {
      await conn.execute(`INSERT INTO customer_wallet (user_id, balance) VALUES (?, 0)
        ON DUPLICATE KEY UPDATE user_id = user_id`, [order.user_id]);
      await conn.execute("UPDATE customer_wallet SET balance = balance + ? WHERE user_id = ?", [points, order.user_id]);
      const [[wallet]] = await conn.execute("SELECT balance FROM customer_wallet WHERE user_id = ?", [order.user_id]);
      await conn.execute(`INSERT INTO wallet_transactions
        (user_id, title, description, transaction_type, coins, category, reference_id, expiry_date, balance_after, reason_code)
        VALUES (?, ?, ?, 'credit', ?, 'reward', ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?, NULL)`,
      [order.user_id, `Points earned from ${source.label}`, `${points} points for ${source.label} #${referenceId}`, points, award.insertId, settings.expiry_days, wallet.balance]);
      await conn.execute("UPDATE transaction_reward_awards SET balance_after = ? WHERE id = ?", [wallet.balance, award.insertId]);
    }
    if (module === "busbooking") await conn.execute("UPDATE busbooking_orders SET reward_coins_earned = ? WHERE id = ?", [points, referenceId]);
    await conn.commit();
    return award.insertId;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

async function dispatchReward(awardId) {
  const [[award]] = await db.execute(`SELECT a.*, c.name, c.phone, c.company_id
    FROM transaction_reward_awards a JOIN customer c ON c.user_id = a.user_id WHERE a.id = ?`, [awardId]);
  if (!award || !award.points) return;
  const key = `transaction-reward:${award.module}:${award.reference_id}`;
  if (!award.notification_sent) {
    await notifyUserAndWait({ userId: award.user_id, module: "wallet", type: "transaction_reward_earned",
      title: "Reward points earned", message: `You earned ${award.points} points from your ${SOURCES[award.module].label}. Your wallet has been credited.`,
      icon: "wallet", reference_type: award.module, reference_id: award.reference_id,
      action_url: "/wallet", idempotency_key: key, metadata: { points: award.points, balance: award.balance_after } });
    await db.execute("UPDATE transaction_reward_awards SET notification_sent = 1 WHERE id = ?", [awardId]);
  }
  if (!award.whatsapp_queued) {
    const result = await enqueueWhatsApp({ eventName: "rewardpointsupdate", ctx: {
      phone: award.phone, customer_name: award.name, company_id: award.company_id,
      points: award.points, balance: award.balance_after, idempotency_key: key,
    } });
    if (result.ok) await db.execute("UPDATE transaction_reward_awards SET whatsapp_queued = 1 WHERE id = ?", [awardId]);
    else console.warn(`[transaction reward WhatsApp] ${awardId}: ${result.reason}`);
  }
}

// This runs after payment/booking commits. Never let a reward or delivery
// failure change a successful payment into a provider retry or refund.
async function settleTransactionReward(module, referenceId) {
  try {
    const awardId = await creditTransactionReward(module, referenceId);
    if (awardId) await dispatchReward(awardId);
  } catch (error) {
    console.error(`[transaction reward] ${module}/${referenceId}:`, error.message);
  }
}

async function recoverTransactionRewards() {
  for (const module of MODULES) {
    const source = SOURCES[module];
    const [orders] = await db.execute(`SELECT o.id FROM ${source.table} o
      JOIN transaction_reward_settings s ON s.module = ? AND o.created_at >= s.created_at
      LEFT JOIN transaction_reward_awards a ON a.module = s.module AND a.reference_id = o.id
      WHERE ${source.success} AND a.id IS NULL ORDER BY o.id LIMIT 100`, [module]);
    for (const order of orders) await settleTransactionReward(module, order.id);
  }
  const [pending] = await db.execute(`SELECT id FROM transaction_reward_awards
    WHERE points > 0 AND (notification_sent = 0 OR whatsapp_queued = 0) ORDER BY id LIMIT 100`);
  for (const award of pending) {
    try { await dispatchReward(award.id); }
    catch (error) { console.error(`[reward delivery] ${award.id}:`, error.message); }
  }
}

module.exports = { creditTransactionReward, dispatchReward, settleTransactionReward, recoverTransactionRewards };
