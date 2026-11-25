const M=require('../../app/service/v1/utils/serviceMoney');
const {assertServiceSettlementReady,insertServiceLedger,changed}=require('./serviceLedger');
async function ensureWallet(conn, userId) {
  await conn.execute(
    `INSERT INTO customer_wallet (user_id, balance) VALUES (?, 0)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [M.reference(userId)],
  );
}

async function getWalletBalance(conn, userId, lock = false) {
  await ensureWallet(conn, userId);
  const [[wallet]] = await conn.execute(
    `SELECT balance FROM customer_wallet WHERE user_id = ?${lock ? " FOR UPDATE" : ""}`,
    [userId],
  );
  return M.coins(wallet?.balance||0);
}

async function reserveServiceCoins(conn, { parentOrderId, userId, coins }) {
  const amount = M.coins(coins||0);
  if (amount <= 0) return 0;
  await assertServiceSettlementReady(conn);
  M.reference(userId);
  if(!/^[a-f0-9-]{36}$/i.test(String(parentOrderId)))throw M.failure('Invalid service parent reference.');
  const [[existing]]=await conn.execute('SELECT user_id,coins,status FROM service_wallet_reservations WHERE parent_order_id=? FOR UPDATE',[parentOrderId]);
  if(existing){if(Number(existing.user_id)===Number(userId)&&M.coins(existing.coins)===amount&&existing.status==='reserved')return amount;throw M.failure('Reservation reference was already used.','SERVICE_RESERVATION_CONFLICT');}

  await ensureWallet(conn, userId);
  const [updated] = await conn.execute(
    `UPDATE customer_wallet SET balance = balance - ?
     WHERE user_id = ? AND balance >= ?`,
    [amount, userId, amount],
  );
  if (updated.affectedRows !== 1) throw new Error("INSUFFICIENT_WALLET_BALANCE");

  const [inserted] = await conn.execute(
    `INSERT INTO service_wallet_reservations
       (parent_order_id, user_id, coins, status)
     VALUES (?, ?, ?, 'reserved')`,
    [parentOrderId, userId, amount],
  );
  changed(inserted,'Reservation insert');
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
  await assertServiceSettlementReady(conn);
  const balance = await getWalletBalance(conn, reservation.user_id, true);
  const [[serviceOrder]] = await conn.execute(
    `SELECT MIN(id) AS id,SUM(reward_coins_used) AS coins FROM service_orders WHERE parent_order_id = ? AND user_id=?`,
    [parentOrderId,reservation.user_id],
  );
  if(!serviceOrder?.id||M.coins(serviceOrder.coins)!==M.coins(reservation.coins))throw M.failure('Reservation does not match saved service orders.','SERVICE_RESERVATION_MISMATCH');
  await insertServiceLedger(conn,{userId:reservation.user_id,referenceId:serviceOrder.id,transactionType:'debit',reasonCode:'SERVICE_REDEEM',amount:reservation.coins,balanceAfter:balance,title:'Coins used for service'});
  const [consumed]=await conn.execute("UPDATE service_wallet_reservations SET status='consumed',consumed_at=NOW() WHERE id=? AND status='reserved'",[reservation.id]);changed(consumed,'Reservation consumption');
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
  const [restored]=await conn.execute(
    `UPDATE customer_wallet SET balance = balance + ? WHERE user_id = ?`,
    [reservation.coins, reservation.user_id],
  );
  changed(restored,'Reserved coin release');
  const [released]=await conn.execute(
    `UPDATE service_wallet_reservations
     SET status = 'released', released_at = NOW() WHERE id = ?`,
    [reservation.id],
  );
  changed(released,'Reservation release');
  return true;
}

module.exports = {
  getWalletBalance,
  reserveServiceCoins,
  consumeServiceCoins,
  releaseServiceCoins,
};
