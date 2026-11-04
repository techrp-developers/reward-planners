const crypto = require("node:crypto");

// FCM HTTP v1 error codes as surfaced by firebase-admin ("messaging/..." prefix).
// Only these prove the registration itself is dead. "invalid-argument" is
// deliberately absent: it is usually a malformed payload, not a bad token.
const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

// firebase-admin maps both SENDER_ID_MISMATCH (token issued by another
// Firebase project, e.g. a device still on the previous app build) and
// PERMISSION_DENIED (a service-account problem) to "mismatched-credential".
// A sender mismatch is reported as "project_mismatch": the registration is
// valid for its own project, so it is kept and may be retried through the
// legacy Firebase app instead of being deactivated.
const SENDER_ID_MISMATCH = /sender ?id mismatch/i;

const TRANSIENT_CODES = new Set([
  "messaging/internal-error",
  "messaging/server-unavailable",
  "messaging/unknown-error",
  "app/network-error",
  "app/network-timeout",
]);

function getErrorCode(error) {
  const code = String(error?.code || error?.errorInfo?.code || "");
  return code && !code.includes("/") ? `messaging/${code}` : code;
}

function classifyFcmError(error) {
  const code = getErrorCode(error);
  if (INVALID_TOKEN_CODES.has(code)) return "invalid_token";
  // The FCM reason can be in the message or in errorInfo, depending on the SDK path.
  const reason = `${error?.message || ""} ${error?.errorInfo?.message || ""}`;
  if (code === "messaging/mismatched-credential" && SENDER_ID_MISMATCH.test(reason)) {
    return "project_mismatch";
  }
  if (TRANSIENT_CODES.has(code)) return "transient";
  return "permanent";
}

function maskToken(token) {
  const value = String(token || "");
  if (!value) return "";
  return value.length <= 12 ? "***" : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/**
 * Merge per-device registrations with the legacy customer.fcm_token column.
 * The legacy token is only trusted when user_push_tokens has never seen it:
 * once a token row exists, that row's owner and is_active flag are the truth,
 * so a phone handed to another employee stops receiving the old owner's pushes.
 */
function selectDeliveryTokens({ deviceRows = [], legacyToken = null, legacyTokenTracked = false }) {
  const targets = [];
  const seen = new Set();

  for (const row of deviceRows) {
    if (!row?.fcm_token || seen.has(row.fcm_token)) continue;
    seen.add(row.fcm_token);
    targets.push({ token: row.fcm_token, tokenId: row.id ?? null, platform: row.platform ?? null, firebaseProjectId: row.firebase_project_id ?? null });
  }

  if (legacyToken && !legacyTokenTracked && !seen.has(legacyToken)) {
    targets.push({ token: legacyToken, tokenId: null, platform: null, legacy: true });
  }

  return targets;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send with bounded retries for transient FCM/network failures only.
 * Returns attempt history so callers can log each try.
 */
async function sendWithRetry(sendFn, { retryDelaysMs = [500, 2000], sleep = wait } = {}) {
  const attempts = [];

  for (let attempt = 0; ; attempt += 1) {
    try {
      const messageId = await sendFn();
      attempts.push({ attempt: attempt + 1, status: "accepted", messageId });
      return { success: true, messageId, attempts };
    } catch (error) {
      const classification = classifyFcmError(error);
      attempts.push({
        attempt: attempt + 1,
        status: "failed",
        errorCode: getErrorCode(error) || null,
        errorMessage: String(error?.message || error).slice(0, 500),
        classification,
      });

      if (classification !== "transient" || attempt >= retryDelaysMs.length) {
        return { success: false, classification, error, attempts };
      }
      await sleep(retryDelaysMs[attempt]);
    }
  }
}

module.exports = {
  classifyFcmError,
  getErrorCode,
  hashToken,
  maskToken,
  selectDeliveryTokens,
  sendWithRetry,
};
