const cron = require("node-cron");
const db = require("../../config/database");
const { notifyUser } = require("../../app/common/utils/notification");

// Run every day at 9:00 AM: "0 9 * * *"
// For testing purposes, you can change this to "* * * * *" to run every minute
cron.schedule("0 9 * * *", async () => {
  console.log("[Cron] Checking for employee birthdays today...");
  await sendBirthdayWishes();
});

async function sendBirthdayWishes() {
  try {
    const [users] = await db.query(
      `
      SELECT c.user_id, c.name, c.fcm_token
      FROM customer c
      INNER JOIN company_users e ON c.company_user_id = e.id
      WHERE MONTH(e.dob) = MONTH(CURDATE())
        AND DAY(e.dob) = DAY(CURDATE())
        AND c.status = 1
        AND c.fcm_token IS NOT NULL
        AND c.fcm_token != ''
      `
    );

    if (users.length === 0) {
      console.log("[Cron] No birthdays found today.");
      return;
    }

    console.log(`[Cron] Found ${users.length} user(s) celebrating birthdays today.`);

    for (const user of users) {
      notifyUser(
        {
          userId: user.user_id,
          module: "birthday",
          type: "birthday_wish",
          title: `Happy Birthday, ${user.name}!`,
          message: "Wishing you a fantastic day filled with joy and success! - Reward Planners",
          icon: "gift",
          reference_type: "birthday",
          reference_id: String(user.user_id),
          action_url: "/profile",
          screen: "Dashboard",
        },
        "birthday wish notification",
      );
    }
  } catch (error) {
    console.error("[Cron] Error running birthday reminder job:", error);
  }
}

module.exports = { sendBirthdayWishes };