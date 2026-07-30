const cron = require("node-cron");
const db = require("../../config/database");
const { getMessaging } = require("firebase-admin/messaging");
require("../../config/firebase");

// Run every minute
cron.schedule("* * * * *", async () => {
  console.log("⏰ [Cron] Checking for tasks starting in 15 minutes...");

  try {
    // Query tasks starting in exactly 15 minutes (between 14 and 15 minutes from now)
    const [tasks] = await db.query(
      `
      SELECT 
        t.id, 
        t.title, 
        t.subtitle, 
        t.start_time, 
        t.task_date,
        c.fcm_token, 
        t.created_by
      FROM todos t
      INNER JOIN customer c ON t.created_by = c.user_id
      WHERE t.completed = 0
        AND t.task_date = CURDATE()
        AND t.start_time >= TIME(DATE_ADD(NOW(), INTERVAL 14 MINUTE))
        AND t.start_time < TIME(DATE_ADD(NOW(), INTERVAL 15 MINUTE))
        AND c.fcm_token IS NOT NULL 
        AND c.fcm_token != ''
      `
    );

    if (tasks.length === 0) {
      return;
    }

    console.log(`[Cron] Found ${tasks.length} task(s) starting in 15 minutes.`);

    const messaging = getMessaging();

    for (const task of tasks) {
      const message = {
        notification: {
          title: `Reminder: ${task.title}`,
          body: task.subtitle || `Your task starts in 15 minutes (${task.start_time})!`,
        },
        android: {
          notification: {
            sound: "default",
            clickAction: "FLUTTER_NOTIFICATION_CLICK",
          },
        },
        token: task.fcm_token,
      };

      try {
        const response = await messaging.send(message);
        console.log(`[Cron] Push notification sent successfully for Task ID ${task.id}:`, response);
      } catch (fcmError) {
        console.error(`[Cron] Failed to send push notification for Task ID ${task.id}:`, fcmError.message);
      }
    }
  } catch (error) {
    console.error("[Cron] Error running todo reminder job:", error);
  }
});
