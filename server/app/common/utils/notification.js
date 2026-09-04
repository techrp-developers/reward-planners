const NotificationModel = require("../models/notificationModel");
const { runNonBlocking } = require("../../../utils/nonBlocking");
const db = require("../../../config/database");
const { getMessaging } = require("firebase-admin/messaging");
require("../../../config/firebase");
const {
  buildNotificationPayload,
  buildPushMessage,
} = require("./notificationPayload");

async function clearInvalidFcmToken(userId, fcmToken, reason) {
  try {
    await db.query(
      `UPDATE user_push_tokens
       SET is_active = 0, updated_at = NOW()
       WHERE user_id = ? AND fcm_token = ?`,
      [userId, fcmToken],
    ).catch((error) => {
      if (error.code !== "ER_NO_SUCH_TABLE") throw error;
    });

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

  let tokens = [];
  try {
    const [deviceRows] = await db.query(
      `SELECT fcm_token FROM user_push_tokens
       WHERE user_id = ? AND is_active = 1 AND fcm_token IS NOT NULL`,
      [userId],
    );
    tokens = deviceRows.map((row) => row.fcm_token);
  } catch (error) {
    if (error.code !== "ER_NO_SUCH_TABLE") throw error;
  }

  if (user?.fcm_token) tokens.push(user.fcm_token);
  tokens = [...new Set(tokens.filter(Boolean))];

  if (!tokens.length) {
    console.log(`[FCM Push] User ${userId} has no active FCM token.`);
    return { success: false, skipped: true, reason: "missing_fcm_token" };
  }

  const results = await Promise.all(tokens.map(async (token) => {
    try {
      const response = await getMessaging().send(buildPushMessage(data, token));
      return { token, success: true, response };
    } catch (err) {
      const errorCode = err?.code || err?.errorInfo?.code || "";
      if (["registration-token-not-registered", "invalid-registration-token", "invalid-argument"]
        .some((code) => errorCode.includes(code))) {
        await clearInvalidFcmToken(userId, token, errorCode || err.message);
      }
      return { token, success: false, error: err };
    }
  }));

  const sent = results.filter((result) => result.success).length;
  if (sent) console.log(`[FCM Push] Sent to ${sent}/${tokens.length} device(s) for User ${userId}.`);
  return { success: sent > 0, sent, failed: tokens.length - sent, results };
}

async function createInAppNotification(data) {
  return NotificationModel.create(buildNotificationPayload(data));
}

function notifyUser(data, label = "notification") {
  const userId = data?.userId || data?.user_id;
  if (!userId) return;

  const payload = buildNotificationPayload(data);

  runNonBlocking(async () => {
    const persisted = await createInAppNotification(payload);
    // A duplicate terminal event should not produce another push either.
    if (persisted?.created === false) return;
    await sendPushNotification(payload);
  }, label);
}

// Awaitable variant for workers/cron jobs that must deliberately pace delivery.
// Keeping this separate from notifyUser preserves the fire-and-forget behaviour
// expected by request handlers.
async function notifyUserAndWait(data) {
  const userId = data?.userId || data?.user_id;
  if (!userId) {
    return { success: false, skipped: true, reason: "missing_user_id" };
  }

  const payload = buildNotificationPayload(data);
  const persisted = await createInAppNotification(payload);
  if (persisted?.created === false) {
    return { success: false, skipped: true, reason: "duplicate" };
  }

  return sendPushNotification(payload);
}

module.exports = {
  buildNotificationPayload,
  buildPushMessage,
  notifyUser,
  notifyUserAndWait,
  sendPushNotification,
  createInAppNotification,
};
