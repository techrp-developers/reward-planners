const db = require("../../config/database");
const NotificationModel = require("../../app/common/models/notificationModel");
const { getMessaging } = require("firebase-admin/messaging");
require("../../config/firebase");

function buildPushPayload(data, fcmToken) {
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
      sound: String(data.sound || "default"),
      alert_type: String(data.alert_type || ""),
    },
    android: {
      priority: "high",
      notification: {
        sound: "default",
        defaultSound: true,
        channelId: String(data.channel_id || "default"),
        vibrateTimingsMillis: [0, 1000, 500, 1000, 500],
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
    token: fcmToken,
  };
}

async function getUserFcmToken(userId) {
  const [[user]] = await db.query(
    "SELECT fcm_token FROM customer WHERE user_id = ? LIMIT 1",
    [userId]
  );

  return user?.fcm_token || null;
}

async function saveInAppNotification(data) {
  return NotificationModel.create({
    priority: "normal",
    reference_type: "none",
    ...data,
  });
}

async function sendDirectPushNotification(data) {
  const userId = data?.userId || data?.user_id;

  if (!userId) {
    return {
      success: false,
      skipped: true,
      reason: "missing_user_id",
    };
  }

  try {
    const fcmToken = await getUserFcmToken(userId);

    if (!fcmToken) {
      console.log(`[Separate Push] User ${userId} has no active FCM token.`);
      return {
        success: false,
        skipped: true,
        reason: "missing_fcm_token",
      };
    }

    const messaging = getMessaging();
    const message = buildPushPayload(data, fcmToken);
    const response = await messaging.send(message);

    console.log(`[Separate Push] Sent successfully to User ${userId}:`, response);

    return {
      success: true,
      response,
    };
  } catch (error) {
    console.error(`[Separate Push] Failed for User ${userId}:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function sendDirectPushAndSave(data) {
  const notificationId = await saveInAppNotification(data);
  const pushResult = await sendDirectPushNotification(data);

  return {
    success: pushResult.success,
    notificationId,
    pushResult,
  };
}

async function sendTodoReminderPush({
  userId,
  todoId,
  title,
  message,
  reminderType = "CUSTOM",
  screen = "TodoList",
}) {
  return sendDirectPushAndSave({
    userId,
    module: "todo",
    type: "todo_reminder",
    title,
    message,
    icon: "clock",
    reference_type: "todo",
    reference_id: String(todoId || ""),
    action_url: "/todo",
    screen,
    sound: "default",
    alert_type: "todo_alarm",
    channel_id: "todo_reminders",
    metadata: {
      reminderType,
    },
  });
}

module.exports = {
  getUserFcmToken,
  saveInAppNotification,
  sendDirectPushNotification,
  sendDirectPushAndSave,
  sendTodoReminderPush,
};
