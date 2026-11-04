const NotificationModel = require("../models/notificationModel");
const NotificationTemplateModel = require("../models/notificationTemplateModel");
const {
  TemplateRenderError,
  buildTemplateNotification,
} = require("./notificationTemplate");
const { evaluateDeliveryPolicy, notificationCategory } = require("./notificationPolicy");
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

// user_push_tokens.firebase_project_id (migration 20261028_01) remembers which
// Firebase project accepted each device, so old-build devices go straight to
// the legacy project. Without the column every device tries the primary first.
let tokenProjectColumn = true;

async function selectDeviceRows(userId) {
  if (tokenProjectColumn) {
    try {
      const [rows] = await db.query(
        `SELECT id, fcm_token, platform, firebase_project_id FROM user_push_tokens
         WHERE user_id = ? AND is_active = 1 AND fcm_token IS NOT NULL`,
        [userId],
      );
      return rows;
    } catch (error) {
      if (error.code !== "ER_BAD_FIELD_ERROR") throw error;
      tokenProjectColumn = false;
    }
  }
  const [rows] = await db.query(
    `SELECT id, fcm_token, platform FROM user_push_tokens
     WHERE user_id = ? AND is_active = 1 AND fcm_token IS NOT NULL`,
    [userId],
  );
  return rows;
}

async function rememberTokenProject(tokenId, projectId) {
  if (!tokenProjectColumn || !tokenId || !projectId) return;
  await db.query("UPDATE user_push_tokens SET firebase_project_id = ? WHERE id = ?", [projectId, tokenId])
    .catch((error) => console.error("[FCM Push] Could not record token project:", error.message));
}

async function getDeliveryTargets(userId) {
  const [[user]] = await db.query(
    "SELECT fcm_token FROM customer WHERE user_id = ? LIMIT 1",
    [userId]
  );

  let deviceRows = [];
  let legacyTokenTracked = false;
  try {
    deviceRows = await selectDeviceRows(userId);

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
    // notification_id lets the app report the tap and open the inbox item.
    const message = buildPushMessage(notificationId ? { ...data, notification_id: notificationId } : data, target.token);

    // Try the project this device is known to belong to first; on a
    // SenderId mismatch try the other one. Tokens are never deactivated for
    // belonging to another project.
    const primary = { projectId: firebaseStatus.projectId, send: () => getMessaging().send(message) };
    const legacy = legacyFirebaseStatus.enabled
      ? { projectId: legacyFirebaseStatus.projectId, send: () => getMessaging(getApp(legacyFirebaseStatus.appName)).send(message) }
      : null;
    const order = legacy && target.firebaseProjectId === legacy.projectId ? [legacy, primary] : [primary, legacy].filter(Boolean);

    let projectId = order[0].projectId;
    let outcome = await sendWithRetry(order[0].send);
    for (const attempt of outcome.attempts) attemptRows.push({ ...target, ...attempt, userId, notificationId, projectId });
    if (!outcome.success && outcome.classification === "project_mismatch" && order[1]) {
      projectId = order[1].projectId;
      outcome = await sendWithRetry(order[1].send);
      for (const attempt of outcome.attempts) attemptRows.push({ ...target, ...attempt, userId, notificationId, projectId });
    }

    if (outcome.success && target.firebaseProjectId !== projectId) await rememberTokenProject(target.tokenId, projectId);
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

/**
 * Tag promotional automatic events with their category so the daily limit
 * counts them, exactly like campaign and template notifications.
 */
function withCategory(data) {
  const category = notificationCategory(data);
  if (category === "transactional" || data?.metadata?.category === category) return data;
  return { ...data, metadata: { ...(data.metadata && typeof data.metadata === "object" ? data.metadata : {}), category } };
}

/** Pushes already accepted by FCM for this inbox row (attempt log). */
async function acceptedPushCount(notificationId) {
  if (!attemptLogAvailable || !notificationId) return 0;
  try {
    const [[row]] = await db.query(
      "SELECT COUNT(*) AS total FROM notification_push_attempts WHERE notification_id = ? AND status = 'accepted'",
      [notificationId],
    );
    return Number(row?.total || 0);
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") return 0;
    throw error;
  }
}

function notifyUser(data, label = "notification") {
  const userId = data?.userId || data?.user_id;
  if (!userId) return;

  runNonBlocking(() => deliverNotification(data), label);
}

/**
 * Shared dispatch used by automatic module events, template sends, RM
 * campaigns and the campaign scheduler: apply the delivery policy, persist the
 * inbox row (idempotently), then push.
 *
 * Options:
 *  - policy: "enforce" (default) applies consent, quiet hours and daily limits
 *    to promotional/announcement categories; "checked" is for callers that
 *    already evaluated the same policy (the campaign worker, test sends).
 *  - pushIfDuplicate: the campaign queue tracks push state itself, so a
 *    retried recipient re-pushes for its existing inbox row ...
 *  - ... unless that row already has an accepted push (a worker that crashed
 *    after FCM accepted but before recording the result): no second push.
 */
async function deliverNotification(data, { pushIfDuplicate = false, policy = "enforce" } = {}) {
  const userId = data?.userId || data?.user_id;
  if (!userId) {
    return { success: false, skipped: true, reason: "missing_user_id" };
  }

  const tagged = withCategory(data);
  if (policy === "enforce") {
    const decision = await evaluateDeliveryPolicy(tagged);
    if (!decision.allowed) {
      return { success: false, skipped: true, reason: decision.reason, category: decision.category, resumeAt: decision.resumeAt };
    }
  }

  const payload = buildNotificationPayload(tagged);
  const persisted = await createInAppNotification(payload);
  if (!persisted) {
    return { success: false, skipped: true, reason: "invalid_notification" };
  }
  if (persisted.created === false && !pushIfDuplicate) {
    return { success: false, skipped: true, reason: "duplicate", notificationId: persisted.notificationId };
  }
  if (persisted.created === false) {
    const accepted = await acceptedPushCount(persisted.notificationId);
    if (accepted) {
      return { success: true, sent: accepted, failed: 0, results: [], alreadyAccepted: true, notificationId: persisted.notificationId, created: false };
    }
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

  // Consent, quiet hours and the daily limit are applied by deliverNotification
  // (the payload carries the template's category in metadata).
  const preferences = options.language ? null : await NotificationTemplateModel.getPreferences(userId);

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

  return deliverNotification(payload);
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
  // For the single-device QA push (singleDeviceTestPush.js): same attempt log.
  recordPushAttempts,
};
