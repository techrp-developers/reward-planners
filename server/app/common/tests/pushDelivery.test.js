const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  classifyFcmError,
  maskToken,
  selectDeliveryTokens,
  sendWithRetry,
} = require("../utils/pushDelivery");

const fcmError = (code, message = code) => Object.assign(new Error(message), { code });

test("only dead registrations are classified as invalid tokens", () => {
  assert.equal(classifyFcmError(fcmError("messaging/registration-token-not-registered")), "invalid_token");
  assert.equal(classifyFcmError(fcmError("messaging/invalid-registration-token")), "invalid_token");
  // Malformed payloads must never deactivate a valid device.
  assert.equal(classifyFcmError(fcmError("messaging/invalid-argument")), "permanent");
  assert.equal(classifyFcmError(fcmError("messaging/internal-error")), "transient");
});

test("old/new Firebase project mismatch keeps the token; permission errors are permanent", () => {
  // A legacy-project registration is valid for its own project: never deactivated.
  assert.equal(
    classifyFcmError(fcmError("messaging/mismatched-credential", "SenderId mismatch")),
    "project_mismatch",
  );
  assert.equal(
    classifyFcmError(fcmError("messaging/mismatched-credential", "Permission denied on resource project")),
    "permanent",
  );
});

test("tokens are masked for logs and API responses", () => {
  const token = "fAKEtoken1234567890abcdefghijklmnopqrstuvwxyz";
  const masked = maskToken(token);
  assert.equal(masked, "fAKEto...wxyz");
  assert.ok(!masked.includes("1234567890"));
  assert.equal(maskToken(""), "");
});

test("multi-device users receive one push per distinct active device", () => {
  const targets = selectDeliveryTokens({
    deviceRows: [
      { id: 1, fcm_token: "phone", platform: "android" },
      { id: 2, fcm_token: "tablet", platform: "ios" },
      { id: 3, fcm_token: "phone", platform: "android" },
    ],
  });
  assert.deepEqual(targets.map((t) => t.token), ["phone", "tablet"]);
});

test("legacy customer token is used only when user_push_tokens never saw it", () => {
  assert.deepEqual(
    selectDeliveryTokens({ legacyToken: "old", legacyTokenTracked: false }).map((t) => t.token),
    ["old"],
  );
  // Tracked elsewhere (reassigned to another employee, or deactivated on logout).
  assert.deepEqual(selectDeliveryTokens({ legacyToken: "old", legacyTokenTracked: true }), []);
});

test("transient failures retry, permanent failures do not", async () => {
  const sleep = async () => {};
  let calls = 0;
  const recovered = await sendWithRetry(async () => {
    calls += 1;
    if (calls < 3) throw fcmError("messaging/server-unavailable");
    return "projects/x/messages/1";
  }, { sleep });
  assert.equal(recovered.success, true);
  assert.equal(recovered.attempts.length, 3);

  calls = 0;
  const rejected = await sendWithRetry(async () => {
    calls += 1;
    throw fcmError("messaging/registration-token-not-registered");
  }, { sleep });
  assert.equal(rejected.success, false);
  assert.equal(rejected.classification, "invalid_token");
  assert.equal(calls, 1);
});

test("retries are bounded", async () => {
  const outcome = await sendWithRetry(async () => {
    throw fcmError("messaging/internal-error");
  }, { sleep: async () => {}, retryDelaysMs: [1, 1] });
  assert.equal(outcome.success, false);
  assert.equal(outcome.attempts.length, 3);
});

function loadFirebaseStatus(env) {
  const script = `const { firebaseStatus } = require(${JSON.stringify(path.join(__dirname, "../../../config/firebase"))});
process.stdout.write(JSON.stringify(firebaseStatus));`;
  const output = execFileSync(process.execPath, ["-e", script], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  // dotenv may print its own banner first; the status is the last line.
  return JSON.parse(output.trim().split("\n").pop());
}

test("missing Firebase credentials disable push without crashing", () => {
  const status = loadFirebaseStatus({
    FIREBASE_SERVICE_ACCOUNT: "",
    FIREBASE_SERVICE_ACCOUNT_PATH: "does-not-exist/firebase.json",
  });
  assert.equal(status.enabled, false);
  assert.match(status.reason, /^Missing Firebase credentials/);
});

test("credentials for a different Firebase project disable push", () => {
  const status = loadFirebaseStatus({
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: "rewardplanners-ebbe4" }),
    FIREBASE_PROJECT_ID: "reward-planners-2324d",
  });
  assert.equal(status.enabled, false);
  assert.equal(status.projectId, "rewardplanners-ebbe4");
  assert.match(status.reason, /project mismatch/);
});
