const db = require("../../config/database");
const {
  getUserFcmToken,
  sendDirectPushAndSave,
} = require("./separatePushService");
const {
  buildNotificationPayload,
  getNotificationCatalogSummary,
  getNotificationTypeKeys,
} = require("./pushNotificationCatalog");

async function getPushHealth(userId) {
  const [[user]] = await db.query(
    `
    SELECT user_id, name, email, fcm_token, last_login_at
    FROM customer
    WHERE user_id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (!user) {
    return null;
  }

  const [recentNotifications] = await db.query(
    `
    SELECT
      notification_id,
      module,
      type,
      title,
      message,
      is_read,
      created_at
    FROM notifications
    WHERE user_id = ?
    ORDER BY notification_id DESC
    LIMIT 20
    `,
    [userId]
  );

  const [notificationCounts] = await db.query(
    `
    SELECT module, COUNT(*) AS total
    FROM notifications
    WHERE user_id = ?
    GROUP BY module
    ORDER BY total DESC, module ASC
    `,
    [userId]
  );

  const [todoReminders] = await db.query(
    `
    SELECT
      id,
      todo_id,
      reminder_type,
      reminder_label,
      scheduled_for,
      status,
      attempt_count,
      sent_at,
      last_error,
      updated_at
    FROM todo_reminders
    WHERE user_id = ?
    ORDER BY scheduled_for DESC, id DESC
    LIMIT 20
    `,
    [userId]
  );

  return {
    user: {
      userId: user.user_id,
      name: user.name,
      email: user.email,
      hasFcmToken: Boolean(user.fcm_token),
      fcmTokenPreview: user.fcm_token
        ? `${String(user.fcm_token).slice(0, 16)}...`
        : null,
      lastLoginAt: user.last_login_at,
    },
    notificationCounts,
    recentNotifications,
    todoReminders,
  };
}

async function triggerCatalogPush({
  userId,
  type,
  overrides = {},
}) {
  const payload = buildNotificationPayload(type, overrides);

  if (!payload) {
    return {
      success: false,
      error: "invalid_notification_type",
      availableTypes: getNotificationTypeKeys(),
    };
  }

  const result = await sendDirectPushAndSave({
    userId,
    ...payload,
  });

  return {
    success: result.success,
    userId,
    type,
    payload,
    notificationId: result.notificationId,
    pushResult: result.pushResult,
  };
}

async function triggerCatalogPushMany({
  userIds,
  type,
  overrides = {},
}) {
  const uniqueUserIds = [...new Set(
    (Array.isArray(userIds) ? userIds : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  )];

  if (!uniqueUserIds.length) {
    return {
      success: false,
      error: "valid_user_ids_required",
    };
  }

  const payload = buildNotificationPayload(type, overrides);

  if (!payload) {
    return {
      success: false,
      error: "invalid_notification_type",
      availableTypes: getNotificationTypeKeys(),
    };
  }

  const results = [];

  for (const userId of uniqueUserIds) {
    const result = await sendDirectPushAndSave({
      userId,
      ...payload,
    });

    results.push({
      userId,
      success: result.success,
      notificationId: result.notificationId,
      pushResult: result.pushResult,
    });
  }

  return {
    success: true,
    type,
    totalUsers: uniqueUserIds.length,
    sentCount: results.filter((item) => item.success).length,
    failedCount: results.filter((item) => !item.success).length,
    results,
  };
}

async function runHealthCheckPush(userId) {
  const token = await getUserFcmToken(userId);

  if (!token) {
    return {
      success: false,
      skipped: true,
      reason: "missing_fcm_token",
    };
  }

  return sendDirectPushAndSave({
    userId,
    module: "system",
    type: "health_check",
    title: "Push health check",
    message: "This is a live push notification health check from Reward Planners backend.",
    icon: "activity",
    reference_type: "health_check",
    reference_id: String(userId),
    action_url: "/",
    screen: "Dashboard",
  });
}

module.exports = {
  getPushHealth,
  triggerCatalogPush,
  triggerCatalogPushMany,
  runHealthCheckPush,
  getNotificationCatalogSummary,
  getNotificationTypeKeys,
};
