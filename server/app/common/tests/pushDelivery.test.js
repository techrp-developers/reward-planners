const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
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

// Status as computed synchronously at require time. The process exits before
// the asynchronous credential check, so nothing contacts Google.
function loadFirebaseStatus(env) {
  const script = `const { firebaseStatus } = require(${JSON.stringify(path.join(__dirname, "../../../config/firebase"))});
process.stdout.write(JSON.stringify(firebaseStatus), () => process.exit(0));`;
  // Empty values stop dotenv from filling these in from the developer's .env.
  const isolated = {
    FIREBASE_CREDENTIAL_MODE: "", FIREBASE_PROJECT_ID: "", FIREBASE_SERVICE_ACCOUNT: "", FIREBASE_SERVICE_ACCOUNT_PATH: "",
    FIREBASE_LEGACY_SERVICE_ACCOUNT: "", FIREBASE_LEGACY_SERVICE_ACCOUNT_PATH: "", GOOGLE_APPLICATION_CREDENTIALS: "",
    CLOUDSDK_CONFIG: path.join(os.tmpdir(), "rp-firebase-test-no-gcloud"),
  };
  const output = execFileSync(process.execPath, ["-e", script], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...isolated, ...env },
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
  assert.match(status.reason, /FIREBASE_SERVICE_ACCOUNT_PATH does not point to an existing file/);
});

test("credentials for a different Firebase project disable push", () => {
  const status = loadFirebaseStatus({
    // Structurally valid but fake key (never used to contact Firebase).
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ type: "service_account", project_id: "rewardplanners-ebbe4", client_email: "test@rewardplanners-ebbe4.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nZmFrZQ==\n-----END PRIVATE KEY-----\n" }),
    FIREBASE_PROJECT_ID: "reward-planners-2324d",
  });
  assert.equal(status.enabled, false);
  assert.equal(status.projectId, "rewardplanners-ebbe4");
  assert.match(status.reason, /project mismatch/);
});

// Fake ADC file in the shape `gcloud auth application-default login
// --impersonate-service-account` writes. Never used to contact Google.
function writeImpersonatedAdc(email) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rp-adc-"));
  const file = path.join(dir, "application_default_credentials.json");
  fs.writeFileSync(file, JSON.stringify({
    type: "impersonated_service_account",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:generateAccessToken`,
    source_credentials: { type: "authorized_user", client_id: "x", client_secret: "x", refresh_token: "x" },
  }));
  return file;
}

const FAKE_PRIMARY_KEY = JSON.stringify({ type: "service_account", project_id: "reward-planners-2324d", client_email: "test@reward-planners-2324d.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nZmFrZQ==\n-----END PRIVATE KEY-----\n" });

test("application_default mode stays disabled until a token is obtained and ignores key files", () => {
  const status = loadFirebaseStatus({
    FIREBASE_CREDENTIAL_MODE: "application_default",
    FIREBASE_PROJECT_ID: "reward-planners-2324d",
    FIREBASE_SERVICE_ACCOUNT: FAKE_PRIMARY_KEY,
    GOOGLE_APPLICATION_CREDENTIALS: writeImpersonatedAdc("firebase-adminsdk-fbsvc@reward-planners-2324d.iam.gserviceaccount.com"),
  });
  assert.equal(status.credentialMode, "application_default");
  assert.equal(status.enabled, false);
  assert.equal(status.credentialCheck, "pending");
  assert.equal(status.serviceAccountEmail, "firebase-adminsdk-fbsvc@reward-planners-2324d.iam.gserviceaccount.com");
  assert.match(status.adcSource, /impersonating/);
});

test("application_default mode rejects ADC that impersonates another project's service account", () => {
  const status = loadFirebaseStatus({
    FIREBASE_CREDENTIAL_MODE: "application_default",
    FIREBASE_PROJECT_ID: "reward-planners-2324d",
    GOOGLE_APPLICATION_CREDENTIALS: writeImpersonatedAdc("firebase-adminsdk-x@rewardplanners-ebbe4.iam.gserviceaccount.com"),
  });
  assert.equal(status.enabled, false);
  assert.equal(status.credentialCheck, null);
  assert.match(status.reason, /project mismatch.*rewardplanners-ebbe4/);
});

test("application_default mode reports a missing GOOGLE_APPLICATION_CREDENTIALS file and a missing project id", () => {
  const missingFile = loadFirebaseStatus({
    FIREBASE_CREDENTIAL_MODE: "application_default",
    FIREBASE_PROJECT_ID: "reward-planners-2324d",
    GOOGLE_APPLICATION_CREDENTIALS: "does-not-exist/adc.json",
  });
  assert.equal(missingFile.enabled, false);
  assert.match(missingFile.reason, /GOOGLE_APPLICATION_CREDENTIALS does not point to an existing file/);

  const noProject = loadFirebaseStatus({ FIREBASE_CREDENTIAL_MODE: "application_default" });
  assert.equal(noProject.enabled, false);
  assert.match(noProject.reason, /requires FIREBASE_PROJECT_ID/);
});

test("an unknown credential mode is rejected instead of falling back to a key", () => {
  const status = loadFirebaseStatus({ FIREBASE_CREDENTIAL_MODE: "keyless", FIREBASE_SERVICE_ACCOUNT: FAKE_PRIMARY_KEY });
  assert.equal(status.enabled, false);
  assert.match(status.reason, /Unknown FIREBASE_CREDENTIAL_MODE/);
});

