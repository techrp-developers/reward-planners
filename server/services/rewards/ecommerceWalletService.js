const db = require("../../config/database");
const { notifyUser } = require("../../app/common/utils/notification");

async function ensureWallet(conn, userId) {
  await conn.query(
    `INSERT INTO customer_wallet (user_id, balance)
     VALUES (?, 0)
     ON DUPLICATE KEY UPDATE balance = balance`,
    [userId],
  );
}

async function reserveWalletCoins(conn, { orderId, userId, coins }) {
  const amount = Number(coins || 0);
  if (amount <= 0) return;

  const [updated] = await conn.query(
    `UPDATE customer_wallet
     SET balance = balance - ?
     WHERE user_id = ? AND balance >= ?`,
    [amount, userId, amount],
  );

  if (updated.affectedRows !== 1) {
    throw new Error("WALLET_BALANCE_CHANGED");
  }

  await conn.query(
    `INSERT INTO wallet_reservations (order_id, user_id, coins, status)
     VALUES (?, ?, ?, 'reserved')`,
    [orderId, userId, amount],
  );
}

async function consumeWalletReservation(conn, { orderId, userId, coins }) {
  const amount = Number(coins || 0);
  if (amount <= 0) return;

  const [[reservation]] = await conn.query(
    `SELECT reservation_id, coins, status
     FROM wallet_reservations
     WHERE order_id = ? AND user_id = ?
     LIMIT 1 FOR UPDATE`,
    [orderId, userId],
  );

  if (reservation?.status === "released") {
    throw new Error("WALLET_RESERVATION_RELEASED");
  }

  if (reservation && Number(reservation.coins) !== amount) {
    throw new Error("WALLET_RESERVATION_MISMATCH");
  }

  if (reservation?.status === "reserved") {
    await conn.query(
      `UPDATE wallet_reservations
       SET status = 'consumed', consumed_at = NOW()
       WHERE reservation_id = ?`,
      [reservation.reservation_id],
    );
  } else if (!reservation) {
    // Compatibility for orders created before wallet reservations existed.
    // A signed balance is intentional: never grant a paid order a free discount.
    await ensureWallet(conn, userId);
    await conn.query(
      `UPDATE customer_wallet SET balance = balance - ? WHERE user_id = ?`,
      [amount, userId],
    );
  }

  const [[wallet]] = await conn.query(
    `SELECT balance FROM customer_wallet WHERE user_id = ? FOR UPDATE`,
    [userId],
  );

  await conn.query(
    `INSERT IGNORE INTO wallet_transactions
      (user_id, title, transaction_type, coins, balance_after, category,
       reference_id, description, reason_code)
     VALUES (?, 'Coins used for order', 'debit', ?, ?, 'order', ?, ?, 'REDEEM')`,
    [userId, amount, wallet?.balance ?? null, orderId, `Used ${amount} coins`],
  );
}

async function releaseWalletReservation(conn, orderId) {
  const [[reservation]] = await conn.query(
    `SELECT reservation_id, user_id, coins, status
     FROM wallet_reservations
     WHERE order_id = ?
     LIMIT 1 FOR UPDATE`,
    [orderId],
  );

  if (!reservation || reservation.status !== "reserved") return false;

  await ensureWallet(conn, reservation.user_id);
  await conn.query(
    `UPDATE customer_wallet SET balance = balance + ? WHERE user_id = ?`,
    [reservation.coins, reservation.user_id],
  );
  await conn.query(
    `UPDATE wallet_reservations
     SET status = 'released', released_at = NOW()
     WHERE reservation_id = ?`,
    [reservation.reservation_id],
  );

  return true;
}

async function addWalletAdjustment(conn, {
  userId,
  coins,
  orderId,
  referenceId = orderId,
  transactionType,
  reasonCode,
  title,
  description,
}) {
  const amount = Number(coins || 0);
  if (amount <= 0) return false;

  await ensureWallet(conn, userId);

  const [inserted] = await conn.query(
    `INSERT IGNORE INTO wallet_transactions
      (user_id, title, transaction_type, coins, category, reference_id,
       description, reason_code)
     VALUES (?, ?, ?, ?, 'order', ?, ?, ?)`,
    [
      userId,
      title,
      transactionType,
      amount,
      referenceId,
      description || null,
      reasonCode,
    ],
  );

  if (!inserted.affectedRows) return false;

  const operator = transactionType === "credit" ? "+" : "-";
  await conn.query(
    `UPDATE customer_wallet SET balance = balance ${operator} ? WHERE user_id = ?`,
    [amount, userId],
  );

  const [[wallet]] = await conn.query(
    `SELECT balance FROM customer_wallet WHERE user_id = ?`,
    [userId],
  );
  await conn.query(
    `UPDATE wallet_transactions
     SET balance_after = ?
     WHERE user_id = ? AND transaction_type = ? AND reason_code = ?
       AND reference_id = ?`,
    [wallet?.balance ?? null, userId, transactionType, reasonCode, referenceId],
  );

  return true;
}

async function creditDeliveredOrderRewards(orderId) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query(
      `SELECT user_id, reward_coins_earned, status
       FROM eorders WHERE order_id = ? FOR UPDATE`,
      [orderId],
    );

    if (!order || order.status !== "delivered") {
      await conn.rollback();
      return false;
    }

    const credited = await addWalletAdjustment(conn, {
      userId: order.user_id,
      coins: order.reward_coins_earned,
      orderId,
      transactionType: "credit",
      reasonCode: "ORDER_REWARD",
      title: "Coins earned from delivered order",
      description: `Earned ${Number(order.reward_coins_earned || 0)} coins`,
    });

    await conn.commit();
    if (credited) {
      notifyUser(
        {
          userId: order.user_id,
          module: "wallet",
          type: "order_reward_earned",
          title: "Coins earned",
          message: `You earned ${Number(order.reward_coins_earned || 0)} reward coins from your delivered order.`,
          icon: "wallet",
          reference_type: "order",
          reference_id: orderId,
          action_url: "/wallet",
        },
        "delivered-order reward notification",
      );
    }
    return credited;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  reserveWalletCoins,
  consumeWalletReservation,
  releaseWalletReservation,
  addWalletAdjustment,
  creditDeliveredOrderRewards,
};
