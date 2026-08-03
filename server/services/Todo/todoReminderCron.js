const cron = require("node-cron");
const db = require("../../config/database");
const { getMessaging } = require("firebase-admin/messaging");
require("../../config/firebase");

// Run every minute
cron.schedule("* * * * *", async () => {
  console.log("⏰ [Cron] Checking for tasks starting in 15 minutes or matching custom reminders...");

  try {
    // Query tasks matching either:
    // A) start_time is in exactly 15 minutes (between 14 and 15 mins from now)
    // B) custom reminder_time matches the current minute (between 0 and 1 min from now)
    const [tasks] = await db.query(
      `
      SELECT 
        t.id, 
        t.title, 
        t.subtitle, 
        t.start_time, 
        t.task_date,
        t.reminder_time,
        c.fcm_token, 
        t.created_by,
        CASE 
          WHEN t.start_time >= TIME(DATE_ADD(NOW(), INTERVAL 14 MINUTE)) 
               AND t.start_time < TIME(DATE_ADD(NOW(), INTERVAL 15 MINUTE)) THEN 'START_15'
          ELSE 'REMINDER_TIME'
        END AS trigger_type
      FROM todos t
      INNER JOIN customer c ON t.created_by = c.user_id
      WHERE t.completed = 0
        AND t.task_date = CURDATE()
        AND c.fcm_token IS NOT NULL 
        AND c.fcm_token != ''
        AND (
          -- Trigger A: Task starts in 15 minutes
          (t.start_time >= TIME(DATE_ADD(NOW(), INTERVAL 14 MINUTE)) AND t.start_time < TIME(DATE_ADD(NOW(), INTERVAL 15 MINUTE)))
          OR
          -- Trigger B: Current time matches the custom reminder_time
          (t.reminder_time >= TIME(NOW()) AND t.reminder_time < TIME(DATE_ADD(NOW(), INTERVAL 1 MINUTE)))
        )
      `
    );

    if (tasks.length === 0) {
      return;
    }

    console.log(`[Cron] Found ${tasks.length} task(s) requiring push notifications.`);

    const messaging = getMessaging();

    for (const task of tasks) {
      const isStartReminder = task.trigger_type === 'START_15';
      const titleText = isStartReminder ? `Upcoming Task: ${task.title}` : `Reminder: ${task.title}`;
      const bodyText = isStartReminder 
        ? `Starts in 15 minutes at ${task.start_time}!` 
        : (task.subtitle || `It's time for your task!`);

      const message = {
        notification: {
          title: titleText,
          body: bodyText,
        },
        data: {
          module: "todo",
          type: "todo_reminder",
          screen: "TodoList",
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            defaultSound: true,
            // Vibration pattern: [delay, vibrate, delay, vibrate...]
            // 0ms delay, vibrate 1s, delay 500ms, vibrate 1s, delay 500ms (vibrates for 3 seconds)
            vibrateTimingsMillis: [0, 1000, 500, 1000, 500],
          },
        },
        token: task.fcm_token,
      };

      try {
        const response = await messaging.send(message);
        console.log(`[Cron] Push notification sent successfully for Task ID ${task.id} (${task.trigger_type}):`, response);
      } catch (fcmError) {
        console.error(`[Cron] Failed to send push notification for Task ID ${task.id}:`, fcmError.message);
      }
    }
  } catch (error) {
    console.error("[Cron] Error running todo reminder job:", error);
  }
});
