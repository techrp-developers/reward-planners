// One real push to ONE registered device of an allow-listed test employee,
// for local Android QA. Not a campaign: no audience, no queue, no retries.
//   - Targets exactly one active Android token on the primary Firebase project,
//     chosen by row id, and refuses if there is not exactly one.
//   - One FCM send() call: a retry after an ambiguous network error could
//     deliver twice, so failures are reported, never retried.
//   - Creates the inbox row first so notification_id drives tap/open tracking.
// The route decides who may call this (verified RM, development only).
const db = require("../../../config/database");
const { getMessaging } = require("firebase-admin/messaging");
const { firebaseStatus } = require("../../../config/firebase");
const NotificationModel = require("../models/notificationModel");
const { buildNotificationPayload, buildPushMessage } = require("./notificationPayload");
const { maskToken } = require("./pushDelivery");
const { recordPushAttempts } = require("./notification");

const TEST_CONTENT = Object.freeze({
  module: "common",
  type: "push_test",
  title: "Reward Planners Test",
  message: "Your push notification is working! Tap to open Reward Planners.",
  icon: "bell",
  priority: "high",
  reference_type: "push_test",
  screen: "Notifications",
});

class TestPushError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

/**
 * The single device a test push may go to, or why there is none. With
 * `deviceId` the caller names the device (it must be one of this employee's
 * active primary-project devices); otherwise there must be exactly one.
 * Never returns the raw token to callers.
 */
async function resolveTestDevice(userId, deps = {}) {
  const query = deps.query || ((sql, params) => db.query(sql, params));
  const projectId = deps.projectId || firebaseStatus.projectId;
  const [rows] = await query(
    `SELECT id, fcm_token, platform, firebase_project_id, last_seen_at
     FROM user_push_tokens WHERE user_id = ? AND is_active = 1`,
    [userId],
  );
  const primary = rows.filter((row) => row.firebase_project_id === projectId);
  const summary = {
    activeDevices: rows.length,
    primaryProjectDevices: primary.length,
    otherOrUnknownProjectDevices: rows.length - primary.length,
  };
  const deviceId = deps.deviceId == null ? null : Number(deps.deviceId);
  if (deviceId != null) {
    const named = primary.find((row) => Number(row.id) === deviceId);
    if (!named) throw new TestPushError(404, "DEVICE_NOT_FOUND", "That device is not an active primary-project device of this employee.", summary);
    if (named.platform !== "android") throw new TestPushError(409, "DEVICE_NOT_ANDROID", "The registered device is not an Android device.", summary);
    return { device: named, summary };
  }
  if (primary.length !== 1) {
    throw new TestPushError(409, "DEVICE_NOT_UNIQUE",
      primary.length ? "This employee has more than one device on the primary Firebase project; name the device with device_id." : "This employee has no active device on the primary Firebase project.",
      summary);
  }
  if (primary[0].platform !== "android") {
    throw new TestPushError(409, "DEVICE_NOT_ANDROID", "The registered device is not an Android device.", summary);
  }
  return { device: primary[0], summary };
}

/**
 * Send `data` (a notification payload, e.g. a campaign's rendered test) to
 * exactly one device of `userId`. Shared by the dashboard's Send test and
 * the /api/wa developer tool so there is one single-device sender.
 */
async function sendToSingleDevice(userId, data, deps = {}) {
  const status = deps.firebase || firebaseStatus;
  if (!status.enabled) throw new TestPushError(503, "FIREBASE_UNAVAILABLE", `Firebase is not ready: ${status.reason || "disabled"}.`);
  const { device, summary } = await resolveTestDevice(userId, { ...deps, projectId: status.projectId });

  const payload = buildNotificationPayload({ ...data, userId, allow_duplicates: true });
  const inbox = await (deps.createInbox || ((data) => NotificationModel.create(data)))(payload);
  const notificationId = inbox?.notificationId ?? null;
  if (!notificationId) throw new TestPushError(500, "INBOX_NOT_CREATED", "The inbox entry could not be created, so nothing was sent.");
  const message = buildPushMessage({ ...payload, notification_id: notificationId }, device.fcm_token);

  const send = deps.send || ((msg) => getMessaging().send(msg));
  const attempt = { userId, notificationId, tokenId: device.id, token: device.fcm_token, platform: device.platform, projectId: status.projectId, attempt: 1 };
  let messageId = null;
  let error = null;
  try {
    messageId = await send(message);
  } catch (sendError) {
    error = sendError;
  }
  await (deps.recordAttempts || recordPushAttempts)([{
    ...attempt,
    status: error ? "failed" : "accepted",
    messageId,
    errorCode: error ? String(error.code || error.errorInfo?.code || "send_failed").slice(0, 100) : null,
    errorMessage: error ? String(error.message || "").split("\n")[0].slice(0, 500) : null,
  }]);

  return {
    accepted: !error,
    notificationId,
    // projects/<id>/messages/<id>: identifies the send, carries no secret.
    fcmMessageId: messageId,
    errorCode: error ? String(error.code || "send_failed") : null,
    device: { id: device.id, platform: device.platform, firebaseProjectId: status.projectId, token: maskToken(device.fcm_token), lastSeenAt: device.last_seen_at },
    channel: message.android.notification.channelId,
    androidPriority: message.android.priority,
    devicesSummary: summary,
  };
}

function sendSingleDeviceTestPush(userId, deps = {}) {
  return sendToSingleDevice(userId, { ...TEST_CONTENT, reference_id: `push-test-${Date.now()}` }, deps);
}

/** Allow-listed test employees' active primary-project devices, tokens masked. */
async function listTestDevices(userIds, deps = {}) {
  if (!userIds.length) return [];
  const query = deps.query || ((sql, params) => db.query(sql, params));
  const projectId = deps.projectId || firebaseStatus.projectId;
  const [rows] = await query(
    `SELECT id, user_id, fcm_token, platform, last_seen_at FROM user_push_tokens
     WHERE is_active = 1 AND firebase_project_id = ? AND user_id IN (${userIds.map(() => "?").join(",")})
     ORDER BY user_id, last_seen_at DESC`,
    [projectId, ...userIds],
  );
  return rows.map((row) => ({ device_id: row.id, user_id: Number(row.user_id), platform: row.platform, token: maskToken(row.fcm_token), last_seen_at: row.last_seen_at }));
}

module.exports = { TEST_CONTENT, TestPushError, listTestDevices, resolveTestDevice, sendSingleDeviceTestPush, sendToSingleDevice };
