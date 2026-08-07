const NotificationModel = require("../models/notificationModel");
const { runNonBlocking } = require("../../../utils/nonBlocking");
const db = require("../../../config/database");
const { getMessaging } = require("firebase-admin/messaging");
require("../../../config/firebase");

function notifyUser(data, label = "notification") {
  const userId = data?.userId || data?.user_id;
  if (!userId) return;

  // 1. Create database in-app notification (run non-blocking)
  runNonBlocking(
    () =>
      NotificationModel.create({
        priority: "normal",
        reference_type: "none",
        ...data,
      }),
    label,
  );

  // 2. Fetch FCM Token and send push notification (run non-blocking)
  runNonBlocking(
    async () => {
      try {
        const [[user]] = await db.query(
          "SELECT fcm_token FROM customer WHERE user_id = ? LIMIT 1",
          [userId]
        );

        if (user && user.fcm_token) {
          const messaging = getMessaging();
          const message = {
            notification: {
              title: data.title || "Notification",
              body: data.message || "",
            },
            data: {
              module: String(data.module || ""),
              type: String(data.type || ""),
              reference_type: String(data.reference_type || ""),
              reference_id: String(data.reference_id || ""),
              action_url: String(data.action_url || ""),
            },
            android: {
              priority: "high",
              notification: {
                sound: "default",
                defaultSound: true,
                vibrateTimingsMillis: [0, 1000, 500, 1000, 500],
              },
            },
            token: user.fcm_token,
          };

          const response = await messaging.send(message);
          console.log(`[FCM Push] Sent successfully to User ${userId}:`, response);
        } else {
          console.log(`[FCM Push] User ${userId} has no active FCM token.`);
        }
      } catch (err) {
        console.error(`[FCM Push] Failed to send push to User ${userId}:`, err.message);
      }
    },
    `${label} push notification`
  );
}

module.exports = { notifyUser };