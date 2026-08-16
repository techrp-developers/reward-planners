const cron = require("node-cron");
const db = require("../../config/database");

// Keep in sync with reactivateIfWithinGracePeriod() in
// server/app/common/models/authModel.js.
const GRACE_PERIOD_DAYS = 30;

// Run every day at 2:00 AM: "0 2 * * *"
cron.schedule("0 2 * * *", async () => {
  console.log("[Cron] Purging customer accounts past their deletion grace period...");
  await purgeExpiredDeletedAccounts();
});

async function purgeExpiredDeletedAccounts() {
  try {
    const [expired] = await db.query(
      `SELECT user_id FROM customer
       WHERE status = 0
         AND deleted_at IS NOT NULL
         AND deleted_at <= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [GRACE_PERIOD_DAYS],
    );

    if (!expired.length) {
      console.log("[Cron] No expired deleted accounts found.");
      return;
    }

    const userIds = expired.map((row) => row.user_id);
    const placeholders = userIds.map(() => "?").join(",");

    await db.query(`DELETE FROM cart_items WHERE user_id IN (${placeholders})`, userIds);
    await db.query(`DELETE FROM customer_wishlist WHERE user_id IN (${placeholders})`, userIds);
    await db.query(`DELETE FROM customer_addresses WHERE user_id IN (${placeholders})`, userIds);
    await db.query(`DELETE FROM notifications WHERE user_id IN (${placeholders})`, userIds);
    await db.query(`DELETE FROM customer_auth_sessions WHERE user_id IN (${placeholders})`, userIds);
    await db.query(`DELETE FROM customer WHERE user_id IN (${placeholders})`, userIds);

    console.log(`[Cron] Purged ${userIds.length} account(s) past their ${GRACE_PERIOD_DAYS}-day grace period.`);
  } catch (error) {
    console.error("[Cron] Error purging expired deleted accounts:", error);
  }
}

module.exports = { purgeExpiredDeletedAccounts };
