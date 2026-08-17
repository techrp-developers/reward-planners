const NotificationModel = require("../models/notificationModel");
const { runNonBlocking } = require("../../../utils/nonBlocking");
const db = require("../../../config/database");
const { getMessaging } = require("firebase-admin/messaging");
require("../../../config/firebase");

function buildNotificationPayload(data) {
  return {
    priority: "normal",
    reference_type: "none",
    ...data,
  };
}

function buildPushMessage(data, fcmToken) {
  return {
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
      screen: String(data.screen || ""),
      priority: String(data.priority || "normal"),
    },
    android: {
      priority: "high",
      notification: {
        channelId: "reward_planners_general",
        sound: "default",
        defaultSound: true,
        vibrateTimingsMillis: [0, 1000, 500, 1000, 500],
      },
    },
    token: fcmToken,
  };
}

async function clearInvalidFcmToken(userId, fcmToken, reason) {
  try {
    await db.query(
      `
      UPDATE customer
      SET fcm_token = NULL
      WHERE user_id = ?
        AND fcm_token = ?
      `,
      [userId, fcmToken]
    );

    console.warn(
      `[FCM Push] Cleared invalid FCM token for User ${userId}. Reason: ${reason}`,
    );
  } catch (error) {
    console.error(
      `[FCM Push] Failed to clear invalid FCM token for User ${userId}:`,
      error.message,
    );
  }
}

async function sendPushNotification(data) {
  const userId = data?.userId ?? data?.user_id;

  if (!userId) {
    return { success: false, skipped: true, reason: "missing_user_id" };
  }

  const [[user]] = await db.query(
    "SELECT fcm_token FROM customer WHERE user_id = ? LIMIT 1",
    [userId]
  );

  if (!user || !user.fcm_token) {
    console.log(`[FCM Push] User ${userId} has no active FCM token.`);
    return { success: false, skipped: true, reason: "missing_fcm_token" };
  }

  const message = buildPushMessage(data, user.fcm_token);

  try {
    const messaging = getMessaging();
    const response = await messaging.send(message);
    console.log(`[FCM Push] Sent successfully to User ${userId}:`, response);

    return { success: true, response };
  } catch (err) {
    const errorCode = err?.code || err?.errorInfo?.code || "";
    const errorMessage = err?.message || "Unknown FCM error";

    console.error(`[FCM Push] Failed to send push to User ${userId}:`, errorMessage);

    if (
      errorCode.includes("registration-token-not-registered") ||
      errorCode.includes("invalid-registration-token") ||
      errorCode.includes("invalid-argument")
    ) {
      await clearInvalidFcmToken(userId, user.fcm_token, errorCode || errorMessage);
    }

    return { success: false, error: err };
  }
}

async function createInAppNotification(data) {
  return NotificationModel.create(buildNotificationPayload(data));
}

function notifyUser(data, label = "notification") {
  const userId = data?.userId || data?.user_id;
  if (!userId) return;

  const payload = buildNotificationPayload(data);

  runNonBlocking(
    () => createInAppNotification(payload),
    label,
  );

  runNonBlocking(
    () => sendPushNotification(payload),
    `${label} push notification`
  );
}

module.exports = {
  notifyUser,
  sendPushNotification,
  createInAppNotification,
};
