const NotificationModel = require("../models/notificationModel");
const NotificationTemplateModel = require("../models/notificationTemplateModel");
const {
  TemplateRenderError,
  buildTemplateNotification,
  checkPromotionalEligibility,
} = require("./notificationTemplate");
const { runNonBlocking } = require("../../../utils/nonBlocking");
const db = require("../../../config/database");
const { getMessaging } = require("firebase-admin/messaging");
const { getApp } = require("firebase-admin/app");
const { firebaseStatus, legacyFirebaseStatus } = require("../../../config/firebase");
const {
  buildNotificationPayload,
  buildPushMessage,
} = require("./notificationPayload");
const {
  getErrorCode,
  hashToken,
  maskToken,
  selectDeliveryTokens,
  sendWithRetry,
} = require("./pushDelivery");

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
      `[FCM Push] Deactivated FCM token ${maskToken(fcmToken)} for User ${userId}. Reason: ${reason}`,
    );
  } catch (error) {
    console.error(
      `[FCM Push] Failed to clear invalid FCM token for User ${userId}:`,
      error.message,
    );
  }
}

// notification_push_attempts is additive (migrations/20261026_02). Until it is
// applied, sending works exactly as before and only the audit trail is missing.
let attemptLogAvailable = true;

async function recordPushAttempts(rows) {
  if (!attemptLogAvailable || !rows.length) return;

  try {
    await db.query(
      `INSERT INTO notification_push_attempts
       (notification_id, user_id, push_token_id, token_hash, token_preview, platform,
        firebase_project_id, attempt_no, status, fcm_message_id, error_code, error_message)
       VALUES ?`,
      [rows.map((row) => [
        row.notificationId ?? null,
        row.userId,
        row.tokenId ?? null,
        row.token ? hashToken(row.token) : null,
        row.token ? maskToken(row.token) : null,
        row.platform ?? null,
        row.projectId ?? firebaseStatus.projectId,
        row.attempt ?? 1,
        row.status,
        row.messageId ?? null,
        row.errorCode ?? null,
        row.errorMessage ?? null,
      ])],
    );
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      attemptLogAvailable = false;
      console.warn("[FCM Push] notification_push_attempts table missing; delivery attempts are not being logged.");
      return;
    }
    console.error("[FCM Push] Failed to record push attempts:", error.message);
  }
}

async function getDeliveryTargets(userId) {
  const [[user]] = await db.query(
    "SELECT fcm_token FROM customer WHERE user_id = ? LIMIT 1",
    [userId]
  );

  let deviceRows = [];
  let legacyTokenTracked = false;
  try {
    [deviceRows] = await db.query(
      `SELECT id, fcm_token, platform FROM user_push_tokens
       WHERE user_id = ? AND is_active = 1 AND fcm_token IS NOT NULL`,
      [userId],
    );

    if (user?.fcm_token) {
      const [[tracked]] = await db.query(
        "SELECT 1 AS tracked FROM user_push_tokens WHERE fcm_token = ? LIMIT 1",
        [user.fcm_token],
      );
      legacyTokenTracked = Boolean(tracked);
    }
  } catch (error) {
    if (error.code !== "ER_NO_SUCH_TABLE") throw error;
  }

  return selectDeliveryTokens({
    deviceRows,
    legacyToken: user?.fcm_token || null,
    legacyTokenTracked,
  });
}

/**
 * Push to every active device of one user. "accepted" means FCM took the
 * message; it does not prove the device displayed it.
 */
async function sendPushNotification(data, { notificationId = null } = {}) {
  const userId = data?.userId ?? data?.user_id;

  if (!userId) {
    return { success: false, skipped: true, reason: "missing_user_id" };
  }

  if (!firebaseStatus.enabled) {
    return { success: false, skipped: true, reason: "firebase_disabled" };
  }

  const targets = await getDeliveryTargets(userId);

  if (!targets.length) {
    console.log(`[FCM Push] User ${userId} has no active FCM token.`);
    return { success: false, skipped: true, reason: "missing_fcm_token" };
  }

  const attemptRows = [];
  const results = await Promise.all(targets.map(async (target) => {
    const message = buildPushMessage(data, target.token);
    let projectId = firebaseStatus.projectId;
    let outcome = await sendWithRetry(() => getMessaging().send(message));
    for (const attempt of outcome.attempts) {
      attemptRows.push({ ...target, ...attempt, userId, notificationId, projectId });
    }

    // Device still registered with the previous Firebase project: keep the
    // token and deliver through the legacy app when one is configured.
    if (!outcome.success && outcome.classification === "project_mismatch" && legacyFirebaseStatus.enabled) {
      projectId = legacyFirebaseStatus.projectId;
      outcome = await sendWithRetry(() => getMessaging(getApp(legacyFirebaseStatus.appName)).send(message));
      for (const attempt of outcome.attempts) {
        attemptRows.push({ ...target, ...attempt, userId, notificationId, projectId });
      }
    }

    if (!outcome.success && outcome.classification === "invalid_token") {
      await clearInvalidFcmToken(userId, target.token, getErrorCode(outcome.error) || outcome.error?.message);
    }

    return {
      token: maskToken(target.token),
      platform: target.platform,
      projectId,
      success: outcome.success,
      messageId: outcome.messageId ?? null,
      errorCode: outcome.success ? null : getErrorCode(outcome.error) || null,
      classification: outcome.success ? null : outcome.classification,
      attempts: outcome.attempts.length,
    };
  }));

  await recordPushAttempts(attemptRows);

  const sent = results.filter((result) => result.success).length;
  if (sent) console.log(`[FCM Push] Accepted by FCM for ${sent}/${targets.length} device(s) of User ${userId}.`);
  if (sent < targets.length) {
    console.warn(`[FCM Push] ${targets.length - sent}/${targets.length} device(s) failed for User ${userId}.`);
  }
  return { success: sent > 0, sent, failed: targets.length - sent, results };
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
    await sendPushNotification(payload, { notificationId: persisted?.notificationId });
  }, label);
}

/**
 * Shared dispatch used by automatic module events, RM campaigns and the
 * campaign scheduler: persist the inbox row (idempotently), then push.
 *
 * `pushIfDuplicate` is for callers that track push state themselves (the
 * campaign queue): a retried recipient already has its inbox row, but its push
 * has not been accepted yet, so it must be attempted again without creating a
 * second notification.
 */
async function deliverNotification(data, { pushIfDuplicate = false } = {}) {
  const userId = data?.userId || data?.user_id;
  if (!userId) {
    return { success: false, skipped: true, reason: "missing_user_id" };
  }

  const payload = buildNotificationPayload(data);
  const persisted = await createInAppNotification(payload);
  if (!persisted) {
    return { success: false, skipped: true, reason: "invalid_notification" };
  }
  if (persisted.created === false && !pushIfDuplicate) {
    return { success: false, skipped: true, reason: "duplicate", notificationId: persisted.notificationId };
  }

  const push = await sendPushNotification(payload, { notificationId: persisted.notificationId });
  return { ...push, notificationId: persisted.notificationId, created: persisted.created };
}

// Awaitable variant for workers/cron jobs that must deliberately pace delivery.
// Keeping this separate from notifyUser preserves the fire-and-forget behaviour
// expected by request handlers.
async function notifyUserAndWait(data) {
  return deliverNotification(data);
}

const PROMOTIONAL_DAILY_CAP = Number(process.env.NOTIFICATION_PROMO_DAILY_CAP || 2);
const SCHEDULE_TIMEZONE = process.env.SCHEDULE_TIMEZONE || "Asia/Kolkata";

function currentMinutesInTimezone() {
  const [hour, minute] = new Intl.DateTimeFormat("en-GB", {
    timeZone: SCHEDULE_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date()).split(":").map(Number);
  return hour * 60 + minute;
}

/**
 * Send one employee a notification rendered from notification_templates.
 * Disabled templates, missing placeholder values and ineligible promotional
 * sends are reported as skipped and never reach the inbox or FCM.
 *
 *   await notifyUserFromTemplate("order_confirmed", {
 *     userId, variables: { order_id: 42 },
 *     reference_type: "order", reference_id: 42,
 *     action_url: "/orders/order-details/42", screen: "OrderDetails",
 *   });
 */
async function notifyUserFromTemplate(templateKey, options = {}) {
  const userId = options.userId ?? options.user_id;
  if (!userId) return { success: false, skipped: true, reason: "missing_user_id" };

  const template = await NotificationTemplateModel.findByKey(templateKey);
  if (!template) return { success: false, skipped: true, reason: "template_not_found" };
  if (Number(template.is_enabled) !== 1) {
    return { success: false, skipped: true, reason: "template_disabled" };
  }

  const isPromotional = ["marketing", "engagement"].includes(template.notification_type);
  const preferences = isPromotional || !options.language
    ? await NotificationTemplateModel.getPreferences(userId)
    : null;

  if (isPromotional) {
    const eligibility = checkPromotionalEligibility({
      category: template.notification_type,
      preferences,
      sentToday: preferences ? await NotificationTemplateModel.countPromotionalToday(userId) : 0,
      dailyCap: PROMOTIONAL_DAILY_CAP,
      nowMinutes: currentMinutesInTimezone(),
    });
    if (!eligibility.allowed) return { success: false, skipped: true, reason: eligibility.reason };
  }

  let payload;
  try {
    payload = buildTemplateNotification(template, {
      ...options,
      userId,
      language: options.language || preferences?.language || "en",
    });
  } catch (error) {
    if (!(error instanceof TemplateRenderError)) throw error;
    console.error(`[Notification Template] ${templateKey} not sent to User ${userId}: ${error.message}`);
    return { success: false, skipped: true, reason: "missing_template_values", missing: error.missing };
  }

  return notifyUserAndWait(payload);
}

module.exports = {
  buildNotificationPayload,
  buildPushMessage,
  deliverNotification,
  notifyUser,
  notifyUserAndWait,
  notifyUserFromTemplate,
  sendPushNotification,
  createInAppNotification,
};
