const cron = require("node-cron");
const db = require("../../config/database");
const { notifyUser } = require("../../app/common/utils/notification");

// Run daily at 10:00 AM
cron.schedule("0 10 * * *", async () => {
  console.log("⚡ [Cron] Checking for BBPS bill due dates and recharge reminders...");
  await checkBillDueDates();
  await checkRechargeReminders();
});

function pickFirstValue(sources, keys) {
  for (const src of sources) {
    if (!src) continue;
    for (const key of keys) {
      if (src[key] !== undefined && src[key] !== null) {
        return src[key];
      }
    }
  }
  return null;
}

// 1. Bill Due Reminder: Active fetches due in <= 3 days
async function checkBillDueDates() {
  try {
    const [fetches] = await db.query(
      `
      SELECT f.id, f.user_id, f.amount, f.provider_response, c.fcm_token
      FROM bbps_bill_fetches f
      INNER JOIN customer c ON f.user_id = c.user_id
      LEFT JOIN notifications n ON n.user_id = f.user_id 
                               AND n.type = 'bbps_bill_due'
                               AND n.reference_id = CAST(f.id AS CHAR)
                               AND n.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      WHERE f.consumed_at IS NULL
        AND f.expires_at > NOW()
        AND n.notification_id IS NULL
        AND c.fcm_token IS NOT NULL
        AND c.fcm_token != ''
      `
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const f of fetches) {
      if (!f.provider_response) continue;

      let response;
      try {
        response = JSON.parse(f.provider_response);
      } catch (e) {
        continue;
      }

      const dueDateStr = pickFirstValue(
        [response, response.data, response.data?.bill, response.bill],
        ["due_date", "dueDate", "duedate", "billDueDate", "bill_due_date", "billduedate"]
      );

      if (!dueDateStr) continue;

      const dueDate = new Date(dueDateStr);
      dueDate.setHours(0, 0, 0, 0);

      const timeDiff = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));

      if (diffDays >= 0 && diffDays <= 3) {
        notifyUser({
          userId: f.user_id,
          module: "bbps",
          type: "bbps_bill_due",
          title: "Bill Due Alert ⚡",
          message: `Your electricity/gas bill is due soon. Pay via Reward Planners and earn double coins!`,
          icon: "zap",
          reference_type: "bbps_bill",
          reference_id: String(f.id),
          action_url: "/bbps",
        }, "bbps bill due date alert");
      }
    }
  } catch (err) {
    console.error("[Cron] Bill due check failed:", err.message);
  }
}

// 2. Recharge Reminder: Mobile prepaid recharge 28 days ago
async function checkRechargeReminders() {
  try {
    const [recharges] = await db.query(
      `
      SELECT DISTINCT t.user_id, t.amount, t.utility_acc_no, c.fcm_token, t.id, t.created_at
      FROM bbps_transactions t
      INNER JOIN customer c ON t.user_id = c.user_id
      LEFT JOIN notifications n ON n.user_id = t.user_id 
                               AND n.type = 'bbps_recharge_reminder'
                               AND n.reference_id = CAST(t.id AS CHAR)
                               AND n.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      WHERE t.bbps_status = 'PAID'
        AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL 28 DAY)
        AND t.created_at < DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 28 DAY), INTERVAL 1 DAY)
        AND n.notification_id IS NULL
        AND c.fcm_token IS NOT NULL
        AND c.fcm_token != ''
      `
    );

    for (const r of recharges) {
      // Check if user has done any mobile recharge since then
      const [recentRecharges] = await db.query(
        `
        SELECT id FROM bbps_transactions
        WHERE user_id = ? AND utility_acc_no = ? AND bbps_status = 'PAID' AND created_at > ?
        `,
        [r.user_id, r.utility_acc_no, r.created_at]
      );

      if (recentRecharges.length === 0) {
        notifyUser({
          userId: r.user_id,
          module: "bbps",
          type: "bbps_recharge_reminder",
          title: "Prepaid Plan Expiring 📱",
          message: "Time to recharge! Keep your calls and data active. Click here to recharge in 1 tap.",
          icon: "smartphone",
          reference_type: "bbps_transaction",
          reference_id: String(r.id),
          action_url: "/bbps",
        }, "bbps recharge reminder");
      }
    }
  } catch (err) {
    console.error("[Cron] Recharge check failed:", err.message);
  }
}

module.exports = { checkBillDueDates, checkRechargeReminders };
