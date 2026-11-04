// POST /v1/auth/logout with an explicit push_scope (docs/logout-push-scope.md).
// The acting user always comes from the verified access token or the refresh
// session, never from the request body. Audit entries carry no token values.
const AuthModel = require("../models/authModel");
const CampaignModel = require("../models/notificationCampaignModel");
const {
  findCustomerSession,
  revokeAllCustomerSessions,
  revokeCustomerSession,
} = require("./customerAuthSession");

const LOGOUT_PUSH_SCOPES = ["device", "all_devices"];
// What released app builds send when they do not know their FCM token.
const NO_DEVICE_TOKEN = "no-device-token";

function reportedToken(req) {
  const token = req.body?.fcm_token;
  return typeof token === "string" && token.length <= 512 ? token : null;
}

const tokenState = (token) => (!token ? "none" : token === NO_DEVICE_TOKEN ? "placeholder" : "token");

function audit(req, userId, action, decision, details) {
  return CampaignModel.audit({
    actor: { user_id: userId || 0, role: userId ? "employee" : "anonymous" },
    action,
    decision,
    details: { ...details, user_agent: String(req.get("user-agent") || "").slice(0, 120) },
    ip: req.ip,
  });
}

/** Revokes this session and stops pushes to the reported device, and nothing else. */
async function logoutDevice(req, res) {
  const session = await findCustomerSession(req);
  const accessUserId = req.user?.user_id == null ? null : Number(req.user.user_id);
  if (accessUserId != null && session && session.userId !== accessUserId) {
    await audit(req, accessUserId, "logout_device", "denied", { reason: "session_owner_mismatch" });
    return res.status(403).json({ success: false, code: "SESSION_MISMATCH", message: "This session belongs to another account." });
  }

  await revokeCustomerSession(req, res);
  const userId = accessUserId ?? session?.userId ?? null;
  const token = reportedToken(req);
  const state = tokenState(token);
  let deactivated = 0;
  if (state === "token") {
    deactivated = userId
      ? await AuthModel.clearFcmToken(userId, token)
      // No usable session: the unguessable token itself proves the device.
      : await AuthModel.deactivateFcmTokenByValue(token);
  }

  const sessionRevoked = Boolean(session?.active);
  await audit(req, userId, "logout_device", "allowed", { token_state: state, device_token_deactivated: deactivated > 0, session_revoked: sessionRevoked });
  return res.json({
    success: true,
    message: "Logged out successfully",
    push_scope: "device",
    session_revoked: sessionRevoked,
    device_token_deactivated: deactivated > 0,
  });
}

/**
 * An explicit request to sign out everywhere. Needs a verified access token
 * and a live refresh session of the same user; a refusal changes nothing.
 * Access tokens already issued stay valid until they expire (15 minutes).
 */
async function logoutAllDevices(req, res) {
  const userId = req.user?.user_id == null ? null : Number(req.user.user_id);
  if (userId == null) {
    await audit(req, 0, "logout_all_devices", "denied", { reason: "access_token_required" });
    return res.status(401).json({ success: false, code: "AUTH_REQUIRED", message: "Sign in again to log out of all devices." });
  }
  const session = await findCustomerSession(req);
  if (!session?.active || session.userId !== userId) {
    await audit(req, userId, "logout_all_devices", "denied", { reason: "live_session_required" });
    return res.status(403).json({ success: false, code: "SESSION_REQUIRED", message: "A current session of this account is required." });
  }

  // Tokens first: if this fails the session is still live, so a retry works.
  const devicesDeactivated = await AuthModel.clearFcmToken(userId, null);
  const sessionsRevoked = await revokeAllCustomerSessions(userId, res);
  await audit(req, userId, "logout_all_devices", "allowed", { devices_deactivated: devicesDeactivated, sessions_revoked: sessionsRevoked });
  return res.json({
    success: true,
    message: "Logged out of all devices",
    push_scope: "all_devices",
    session_revoked: true,
    sessions_revoked: sessionsRevoked,
    devices_deactivated: devicesDeactivated,
  });
}

/** Measures which clients still omit push_scope, so that path can be retired. */
function auditUnscopedLogout(req, userId, fcmToken) {
  return audit(req, userId, "logout_unscoped", "allowed", { token_state: tokenState(fcmToken), identified: Boolean(userId) });
}

module.exports = { LOGOUT_PUSH_SCOPES, NO_DEVICE_TOKEN, auditUnscopedLogout, logoutAllDevices, logoutDevice };
