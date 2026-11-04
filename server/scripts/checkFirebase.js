/**
 * Non-delivery Firebase readiness check. Nothing is ever delivered:
 *   1. loads credentials the same way the server does (config/firebase.js)
 *   2. obtains an OAuth access token (proves the credentials work)
 *   3. only with --dry-run: two validate-only requests (FCM `validate_only`,
 *      firebase-admin `send(message, true)`), which FCM checks but never
 *      delivers:
 *        - to a fake registration token: expected to be rejected as an
 *          invalid token, which proves auth, IAM and the API all passed
 *        - to a synthetic topic: expected to validate successfully
 *      No real token, database, worker or campaign is touched.
 * Secrets are never printed.
 *
 *   node scripts/checkFirebase.js            # credentials only
 *   node scripts/checkFirebase.js --dry-run  # credentials + FCM HTTP v1 validation
 */
"use strict";

const FAKE_TOKEN = "reward-planners-readiness-check-not-a-real-device-token";
const SYNTHETIC_TOPIC = "rp-validate-only-readiness-check";

/**
 * The only way this script talks to FCM. `true` is firebase-admin's dryRun
 * flag (sets validate_only on the HTTP v1 request) and is never a variable.
 */
function validateOnly(messaging, message) {
  return messaging.send(message, true);
}

/** Classify a validate-only failure. Returns { outcome, detail }. */
function classifyDryRunError(error) {
  const code = String(error?.code || error?.errorInfo?.code || "");
  const text = `${error?.message || ""} ${error?.errorInfo?.message || ""}`;
  const detail = `${code || "no code"}: ${text.trim().split("\n")[0].slice(0, 160)}`;
  if (/SERVICE_DISABLED|has not been used in project|it is disabled/i.test(text)) return { outcome: "api_disabled", detail };
  if (code === "app/invalid-credential" || code === "messaging/authentication-error" || /UNAUTHENTICATED|invalid authentication credentials/i.test(text)) {
    return { outcome: "auth_failed", detail };
  }
  if (/^app\/network-(error|timeout)$/.test(code) || /ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up/i.test(text)) {
    return { outcome: "network", detail };
  }
  if (/registration-token-not-registered|invalid-registration-token/.test(code)
    || (code === "messaging/invalid-argument" && /registration token/i.test(text))) {
    return { outcome: "token_rejected", detail };
  }
  if (/PERMISSION_DENIED|permission|mismatched-credential|third-party-auth-error|403/i.test(`${code} ${text}`)) return { outcome: "permission_denied", detail };
  if (code === "messaging/invalid-argument") return { outcome: "invalid_request", detail };
  return { outcome: "unknown", detail };
}

const OUTCOME_TEXT = {
  token_rejected: "fake token rejected as expected (authentication, IAM and API all passed; nothing delivered)",
  permission_denied: `IAM denied: the identity lacks cloudmessaging.messages.create on this project`,
  api_disabled: "Firebase Cloud Messaging API (V1) is disabled for this project",
  auth_failed: "authentication failed",
  invalid_request: "request format rejected (not a token problem)",
  network: "network problem reaching FCM",
  unknown: "unclassified error",
};

async function probe(messaging, message, projectId) {
  try {
    const name = await validateOnly(messaging, message);
    // A validated message is named projects/<id>/messages/<fake id>.
    const ownProject = String(name || "").startsWith(`projects/${projectId}/`);
    return { ok: ownProject, outcome: ownProject ? "validated" : "unexpected_response", detail: ownProject ? "validated by FCM (validate_only; not delivered)" : "unexpected response name" };
  } catch (error) {
    const { outcome, detail } = classifyDryRunError(error);
    return { ok: false, outcome, detail: `${OUTCOME_TEXT[outcome]} [${detail}]` };
  }
}

async function checkApp({ getApp, getMessaging }, label, appName, projectId, dryRun) {
  const app = getApp(appName);
  const result = { label, projectId, accessToken: "not checked", probes: [] };
  try {
    const token = await app.options.credential.getAccessToken();
    result.accessToken = token?.access_token ? "ok" : "no token returned";
  } catch (error) {
    result.accessToken = `failed (${String(error.message || error).split("\n")[0].slice(0, 160)})`;
    return result;
  }
  if (!dryRun) return result;
  const messaging = getMessaging(app);
  const notification = { title: "readiness check", body: "validate_only; never delivered" };
  result.probes.push({ name: "fake token", expected: "token_rejected", ...(await probe(messaging, { token: FAKE_TOKEN, notification }, projectId)) });
  result.probes.push({ name: "synthetic topic", expected: "validated", ...(await probe(messaging, { topic: SYNTHETIC_TOPIC, notification }, projectId)) });
  return result;
}

async function main(argv = process.argv) {
  const dryRun = argv.includes("--dry-run");
  const { getApp, getApps } = require("firebase-admin/app");
  const { getMessaging } = require("firebase-admin/messaging");
  const { firebaseStatus, legacyFirebaseStatus, firebaseReady, legacyFirebaseReady } = require("../config/firebase");
  await Promise.all([firebaseReady, legacyFirebaseReady]);

  console.log(`Primary: ${firebaseStatus.enabled ? "enabled" : "DISABLED"} | project ${firebaseStatus.projectId || "-"} | expected ${firebaseStatus.expectedProjectId || "(not enforced)"} | credentials ${firebaseStatus.credentialMode || "-"}${firebaseStatus.serviceAccountEmail ? ` | ${firebaseStatus.serviceAccountEmail}` : ""} | check ${firebaseStatus.credentialCheck || "-"}`);
  if (firebaseStatus.adcSource) console.log(`  ADC source: ${firebaseStatus.adcSource}`);
  if (firebaseStatus.reason) console.log(`  reason: ${firebaseStatus.reason}`);
  const legacyApp = getApps().some((app) => app.name === legacyFirebaseStatus.appName);
  console.log(`Legacy:  ${legacyFirebaseStatus.enabled ? "enabled" : legacyApp ? "DISABLED" : "not configured"}${legacyFirebaseStatus.projectId ? ` | project ${legacyFirebaseStatus.projectId}` : ""}${legacyFirebaseStatus.credentialMode ? ` | credentials ${legacyFirebaseStatus.credentialMode}` : ""}${legacyFirebaseStatus.credentialCheck ? ` | check ${legacyFirebaseStatus.credentialCheck}` : ""}`);
  if (legacyFirebaseStatus.reason) console.log(`  reason: ${legacyFirebaseStatus.reason}`);

  const sdk = { getApp, getMessaging };
  const checks = [];
  if (firebaseStatus.enabled) checks.push(await checkApp(sdk, "primary", undefined, firebaseStatus.projectId, dryRun));
  // A disabled keyless legacy app is still probed (validate_only) to confirm the blocker at FCM itself.
  if (legacyApp) checks.push(await checkApp(sdk, "legacy", legacyFirebaseStatus.appName, legacyFirebaseStatus.projectId, dryRun));
  for (const check of checks) {
    console.log(`[${check.label}] ${check.projectId}: access token ${check.accessToken}${dryRun ? "" : "; FCM validation skipped (pass --dry-run)"}`);
    for (const result of check.probes) {
      console.log(`  validate_only -> ${result.name}: ${result.outcome === result.expected ? "PASS" : "FAIL"} - ${result.detail}`);
    }
  }
  const primary = checks.find((check) => check.label === "primary");
  const ok = firebaseStatus.enabled && primary?.accessToken === "ok"
    && primary.probes.every((result) => result.outcome === result.expected);
  return ok ? 0 : 1;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error("Firebase check failed:", String(error.message || error).split("\n")[0]);
    process.exit(1);
  });
}

module.exports = { classifyDryRunError, validateOnly, FAKE_TOKEN, SYNTHETIC_TOPIC };
