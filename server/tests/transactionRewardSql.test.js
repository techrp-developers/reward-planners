const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Temporary tables shadow real tables only for this connection. No customer
// records, balances or messages are changed by these integration tests.
test("SQL: captured payment ranges, atomic wallet credit, duplicate protection and delivery retry", { skip: process.env.RUN_TRANSACTION_REWARD_SQL_TESTS !== "1" }, async () => {
  const db = require("../config/database");
  const conn = await db.getConnection();
  try {
    for (const definition of [
      "bbps_transactions (id INT PRIMARY KEY, user_id INT, created_at DATETIME, bbps_status VARCHAR(30))",
      "busbooking_orders (id INT PRIMARY KEY, user_id INT, created_at DATETIME, status VARCHAR(30), payment_status VARCHAR(30), reward_coins_earned INT DEFAULT 0)",
      "razorpay_orders (id INT PRIMARY KEY, module VARCHAR(20), ref_id INT, status VARCHAR(20), amount DECIMAL(12,2))",
      "customer_wallet (user_id INT PRIMARY KEY, balance INT NOT NULL)",
      "customer (user_id INT PRIMARY KEY, name VARCHAR(50), phone VARCHAR(20), company_id INT)",
      "wallet_transactions (transaction_id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, title VARCHAR(150), description VARCHAR(255), transaction_type VARCHAR(10), coins INT, category VARCHAR(20), reference_id INT, expiry_date DATETIME, balance_after INT, reason_code VARCHAR(50) DEFAULT 'ORDER_REWARD', UNIQUE KEY wallet_unique (user_id, transaction_type, reason_code, reference_id))",
    ]) await conn.query(`CREATE TEMPORARY TABLE ${definition} ENGINE=InnoDB`);
    for (const table of ["transaction_reward_settings", "transaction_reward_awards"]) {
      const [[schema]] = await conn.query(`SHOW CREATE TABLE ${table}`);
      await conn.query(schema["Create Table"].replace("CREATE TABLE", "CREATE TEMPORARY TABLE"));
    }
    const ranges = JSON.stringify([{ min: 100, max: 500, points: 10 }, { min: 500, max: null, points: 25 }]);
    await conn.execute("INSERT INTO transaction_reward_settings (module,ranges_json,created_at) VALUES ('bbps',?,'2026-11-01'),('busbooking',?,'2026-11-01')", [ranges, ranges]);
    await conn.query("INSERT INTO customer VALUES (7,'Test','9999999999',NULL)");
    await conn.query("INSERT INTO bbps_transactions VALUES (1,7,'2026-11-02','PAID'),(2,7,'2026-11-02','FAILED_RETRY'),(3,7,'2026-10-01','PAID'),(4,7,'2026-11-02','PAID'),(5,7,'2026-11-02','PAID'),(6,7,'2026-11-02','PAID')");
    await conn.query("INSERT INTO busbooking_orders VALUES (1,7,'2026-11-02','confirmed','paid',0),(2,7,'2026-11-02','booking_failed','paid',0)");
    await conn.query("INSERT INTO razorpay_orders VALUES (1,'bbps',1,'success',499.99),(2,'bbps',2,'success',500),(3,'bbps',3,'success',500),(4,'bbps',4,'success',99),(5,'busbooking',1,'success',500),(6,'busbooking',2,'success',500),(7,'bbps',5,'created',500),(8,'bbps',6,'success',500)");
    let failWallet = false, failWhatsapp = true;
    const notifications = new Set(), whatsapp = new Set();
    const execute = async (sql, params) => {
      if (failWallet && sql.startsWith("UPDATE customer_wallet")) throw new Error("simulated wallet failure");
      return conn.execute(sql, params);
    };
    const connection = { execute, beginTransaction: () => conn.beginTransaction(), commit: () => conn.commit(), rollback: () => conn.rollback(), release() {} };
    const context = { module: { exports: {} }, console: { error() {}, warn() {} }, require(name) {
      if (name.endsWith("database")) return { execute, getConnection: async () => connection };
      if (name.endsWith("transactionRewardPolicy")) return require("../services/rewards/transactionRewardPolicy");
      if (name.endsWith("notification")) return { notifyUserAndWait: async data => { notifications.add(data.idempotency_key); } };
      if (name.endsWith("waEnqueueService")) return { enqueueWhatsApp: async ({ ctx }) => {
        if (failWhatsapp) return { ok: false, reason: "QUEUE_ERROR" };
        whatsapp.add(ctx.idempotency_key); return { ok: true };
      } };
      throw new Error(name);
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../services/rewards/transactionRewardService.js"), "utf8"), context);
    const service = context.module.exports;
    const award = await service.creditTransactionReward("bbps", 1);
    assert.equal(await service.creditTransactionReward("bbps", 1), award);
    await service.creditTransactionReward("busbooking", 1);
    for (const [module, id] of [["bbps", 2], ["bbps", 3], ["bbps", 5], ["busbooking", 2]]) assert.equal(await service.creditTransactionReward(module, id), null);
    await service.creditTransactionReward("bbps", 4); // unmatched amount recorded as zero
    const [[wallet]] = await conn.query("SELECT balance FROM customer_wallet WHERE user_id=7");
    assert.equal(wallet.balance, 35);
    const [[counts]] = await conn.query("SELECT COUNT(*) AS n FROM wallet_transactions");
    assert.equal(counts.n, 2);
    const [[bus]] = await conn.query("SELECT reward_coins_earned FROM busbooking_orders WHERE id=1");
    assert.equal(bus.reward_coins_earned, 25);
    failWallet = true;
    await assert.rejects(service.creditTransactionReward("bbps", 6), /simulated/);
    const [[rolledBack]] = await conn.query("SELECT COUNT(*) AS n FROM transaction_reward_awards WHERE module='bbps' AND reference_id=6");
    assert.equal(rolledBack.n, 0);
    failWallet = false;
    await service.dispatchReward(award);
    assert.equal(notifications.size, 1);
    assert.equal(whatsapp.size, 0);
    failWhatsapp = false;
    await service.dispatchReward(award);
    await service.dispatchReward(award);
    assert.equal(notifications.size, 1);
    assert.equal(whatsapp.size, 1);
    await service.recoverTransactionRewards();
    const [[recovered]] = await conn.query("SELECT balance FROM customer_wallet WHERE user_id=7");
    assert.equal(recovered.balance, 60);
    await service.recoverTransactionRewards();
    const [[again]] = await conn.query("SELECT balance FROM customer_wallet WHERE user_id=7");
    assert.equal(again.balance, 60);
  } finally { conn.release(); await db.end(); }
});
