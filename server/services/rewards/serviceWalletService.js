async function ensureWallet(conn, userId) {
  await conn.execute(
    `INSERT INTO customer_wallet (user_id, balance) VALUES (?, 0)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [userId],
  );
}

async function getWalletBalance(conn, userId, lock = false) {
  await ensureWallet(conn, userId);
  const [[wallet]] = await conn.execute(
    `SELECT balance FROM customer_wallet WHERE user_id = ?${lock ? " FOR UPDATE" : ""}`,
    [userId],
  );
  return Math.max(0, Math.floor(Number(wallet?.balance || 0)));
}

async function reserveServiceCoins(conn, { parentOrderId, userId, coins }) {
  const amount = Math.floor(Number(coins || 0));
  if (amount <= 0) return 0;

  await ensureWallet(conn, userId);
  const [updated] = await conn.execute(
    `UPDATE customer_wallet SET balance = balance - ?
     WHERE user_id = ? AND balance >= ?`,
    [amount, userId, amount],
  );
  if (updated.affectedRows !== 1) throw new Error("INSUFFICIENT_WALLET_BALANCE");

  await conn.execute(
    `INSERT INTO service_wallet_reservations
       (parent_order_id, user_id, coins, status)
     VALUES (?, ?, ?, 'reserved')`,
    [parentOrderId, userId, amount],
  );
  return amount;
}

async function consumeServiceCoins(conn, parentOrderId) {
  const [[reservation]] = await conn.execute(
    `SELECT id, user_id, coins, status FROM service_wallet_reservations
     WHERE parent_order_id = ? FOR UPDATE`,
    [parentOrderId],
  );
  if (!reservation || reservation.status === "consumed") return false;
  if (reservation.status !== "reserved") throw new Error("SERVICE_WALLET_RESERVATION_RELEASED");

  await conn.execute(
    `UPDATE service_wallet_reservations
     SET status = 'consumed', consumed_at = NOW() WHERE id = ?`,
    [reservation.id],
  );
  const balance = await getWalletBalance(conn, reservation.user_id, true);
  const [[serviceOrder]] = await conn.execute(
    `SELECT MIN(id) AS id FROM service_orders WHERE parent_order_id = ?`,
    [parentOrderId],
  );
  await conn.execute(
    `INSERT IGNORE INTO wallet_transactions
       (user_id, title, transaction_type, coins, balance_after, category,
        reference_id, description, reason_code)
     VALUES (?, 'Coins used for service', 'debit', ?, ?, 'order', ?, ?, 'SERVICE_REDEEM')`,
    [reservation.user_id, reservation.coins, balance, serviceOrder.id, `Used ${reservation.coins} coins`],
  );
  return true;
}

async function releaseServiceCoins(conn, parentOrderId) {
  const [[reservation]] = await conn.execute(
    `SELECT id, user_id, coins, status FROM service_wallet_reservations
     WHERE parent_order_id = ? FOR UPDATE`,
    [parentOrderId],
  );
  if (!reservation || reservation.status !== "reserved") return false;

  await ensureWallet(conn, reservation.user_id);
  await conn.execute(
    `UPDATE customer_wallet SET balance = balance + ? WHERE user_id = ?`,
    [reservation.coins, reservation.user_id],
  );
  await conn.execute(
    `UPDATE service_wallet_reservations
     SET status = 'released', released_at = NOW() WHERE id = ?`,
    [reservation.id],
  );
  return true;
}

module.exports = {
  getWalletBalance,
  reserveServiceCoins,
  consumeServiceCoins,
  releaseServiceCoins,
};
