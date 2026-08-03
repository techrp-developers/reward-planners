const cron = require("node-cron");
const db = require("../../config/database");
const { getMessaging } = require("firebase-admin/messaging");
require("../../config/firebase");

// Run every day at 9:00 AM: "0 9 * * *"
// For testing purposes, you can change this to "* * * * *" to run every minute
cron.schedule("0 9 * * *", async () => {
  console.log("🎂 [Cron] Checking for employee birthdays today...");
  await sendBirthdayWishes();
});

async function sendBirthdayWishes() {
  try {
    // Query users whose birthday is today (using company_users table and dob column)
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

    const messaging = getMessaging();

    for (const user of users) {
      const message = {
        notification: {
          title: `Happy Birthday, ${user.name}! 🎂`,
          body: `Wishing you a fantastic day filled with joy and success! 🎉 - Reward Planners`,
        },
        data: {
          module: "birthday",
          type: "birthday_wish",
          screen: "Dashboard",
        },
        android: {
          notification: {
            sound: "default",
          },
        },
        token: user.fcm_token,
      };

      try {
        const response = await messaging.send(message);
        console.log(`[Cron] Birthday wish sent successfully to ${user.name} (ID: ${user.user_id}):`, response);
      } catch (fcmError) {
        console.error(`[Cron] Failed to send birthday wish to ${user.name}:`, fcmError.message);
      }
    }
  } catch (error) {
    console.error("[Cron] Error running birthday reminder job:", error);
  }
}

// Export the function so it can be manually triggered (for testing API routes)
module.exports = { sendBirthdayWishes };
