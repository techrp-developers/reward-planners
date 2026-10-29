const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyDryRunError, validateOnly } = require("../scripts/checkFirebase");

const fcmError = (code, message) => Object.assign(new Error(message), { code });

test("validate-only requests always pass dryRun=true to firebase-admin", async () => {
  const calls = [];
  const messaging = { async send(...args) { calls.push(args); return "projects/p/messages/fake_message_id"; } };
  await validateOnly(messaging, { topic: "t" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], true);
});

test("dry-run errors are classified by cause", () => {
  const cases = [
    [fcmError("messaging/invalid-argument", "The registration token is not a valid FCM registration token"), "token_rejected"],
    [fcmError("messaging/registration-token-not-registered", "Requested entity was not found."), "token_rejected"],
    [fcmError("messaging/invalid-argument", "Invalid value at 'message.android.ttl'"), "invalid_request"],
    [fcmError("messaging/mismatched-credential", "Permission 'cloudmessaging.messages.create' denied on resource '//cloudresourcemanager.googleapis.com/projects/x' (or it may not exist)."), "permission_denied"],
    [fcmError("messaging/third-party-auth-error", "PERMISSION_DENIED"), "permission_denied"],
    [fcmError("messaging/unknown-error", "Firebase Cloud Messaging API has not been used in project 1 before or it is disabled."), "api_disabled"],
    [fcmError("app/invalid-credential", "Could not load the default credentials."), "auth_failed"],
    [fcmError("messaging/authentication-error", "Request had invalid authentication credentials."), "auth_failed"],
    [fcmError("app/network-error", "getaddrinfo ENOTFOUND fcm.googleapis.com"), "network"],
    [fcmError("messaging/internal-error", "Internal error"), "unknown"],
  ];
  for (const [error, expected] of cases) assert.equal(classifyDryRunError(error).outcome, expected, error.message);
});

test("a malformed payload is never mistaken for a rejected token", () => {
  assert.notEqual(classifyDryRunError(fcmError("messaging/invalid-argument", "Request contains an invalid argument.")).outcome, "token_rejected");
});
