const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

function loadConfig(file, env, dependencies = {}, timers = {}) {
  const warnings = [];
  const errors = [];
  const module = { exports: {} };
  runInNewContext(readFileSync(path.join(__dirname, "..", file), "utf8"), {
    module, exports: module.exports, __dirname: path.join(__dirname, "../config"),
    process: { env },
    require(name) {
      if (name === "path") return path;
      if (name === "dotenv") return { config() {} };
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    console: { log() {}, warn: (...args) => warnings.push(args.join(" ")), error: (...args) => errors.push(args.join(" ")) },
    setImmediate: (callback) => callback(),
    ...timers,
  });
  return { exports: module.exports, warnings, errors };
}

test("database keeps defaults and warns without exposing passwords", () => {
  let options;
  const mysql = { createPool(config) {
    options = config;
    return { getConnection(callback) { callback(null, { release() {} }); }, promise() { return {}; } };
  } };
  const result = loadConfig("config/database.js", {}, { mysql2: mysql });
  assert.equal(options.host, "localhost");
  assert.equal(options.user, "root");
  assert.equal(options.database, "rewardplanners_db");
  assert.equal(options.password, "");
  assert.equal(options.connectTimeout, 10000);
  assert.equal(options.dateStrings, true);
  assert.equal(result.warnings.length, 2);
});

test("startup retries a timeout only once and respects configured timeout", () => {
  let attempts = 0;
  let timeout;
  const mysql = { createPool(config) {
    timeout = config.connectTimeout;
    return { getConnection(callback) { attempts++; callback({ code: "ETIMEDOUT" }); }, promise() { return {}; } };
  } };
  const result = loadConfig("config/database.js", { DB_CONNECT_TIMEOUT_MS: "15000", DB_NAME: "rewardplanners_db" }, { mysql2: mysql }, {
    setTimeout(callback, delay) { assert.equal(delay, 1000); callback(); return { unref() {} }; },
  });
  assert.equal(timeout, 15000);
  assert.equal(attempts, 2);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /ETIMEDOUT/);
});

test("authentication errors are not retried", () => {
  let attempts = 0;
  const mysql = { createPool() {
    return { getConnection(callback) { attempts++; callback({ code: "ER_ACCESS_DENIED_ERROR" }); }, promise() { return {}; } };
  } };
  const result = loadConfig("config/database.js", {}, { mysql2: mysql }, {
    setTimeout() { assert.fail("Authentication errors must not be retried"); },
  });
  assert.equal(attempts, 1);
  assert.match(result.errors[0], /ER_ACCESS_DENIED_ERROR/);
});

test("missing Gmail credentials warn once and skip SMTP verification", () => {
  const result = loadConfig("config/mailTransport.js", {}, {
    nodemailer: { createTransport() { return { verify() { assert.fail("Missing credentials must not contact SMTP"); } }; } },
  }, { setImmediate() { assert.fail("Missing credentials must not schedule SMTP verification"); } });
  assert.equal(result.warnings.length, 1);
  assert.equal(result.errors.length, 0);
  assert.throws(() => result.exports.assertMailConfigured(), /MAIL_CONFIG_MISSING/);
});

test("missing Firebase credentials warn once without failing module load", () => {
  const result = loadConfig("config/firebase.js", {}, {
    fs: { existsSync() { return false; } },
    "firebase-admin/app": { getApps() { return []; }, cert() { assert.fail("No credentials to certify"); }, initializeApp() { assert.fail("No credentials to initialize"); } },
  });
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Firebase push notifications are disabled/);
  assert.equal(result.errors.length, 0);
});

// ADC mode with an injectable ADC file and access-token behaviour. Nothing
// contacts Google: firebase-admin/app and fs are replaced.
function loadAdcFirebase({ adcFile = null, tokens, env = {}, fetch, cert }) {
  const state = { adcFile, initialized: 0, tokenCalls: 0, timers: [], apps: [] };
  const credential = { async getAccessToken() { return tokens[state.tokenCalls++](); } };
  const result = loadConfig("config/firebase.js", {
    FIREBASE_CREDENTIAL_MODE: "application_default", FIREBASE_PROJECT_ID: "reward-planners-2324d", HOME: "/home/test", ...env,
  }, {
    fs: { existsSync: (file) => Boolean(state.adcFile) && /application_default_credentials\.json$/.test(file), readFileSync: () => JSON.stringify(state.adcFile) },
    "firebase-admin/app": {
      getApps: () => state.apps.map((name) => ({ name })),
      initializeApp(options, name = "[DEFAULT]") { state.initialized += 1; state.apps.push(name); state[name] = options; },
      applicationDefault: () => credential,
      cert: cert || (() => assert.fail("ADC mode must not load a key")),
      getApp: () => ({ options: { credential } }),
    },
  }, { fetch, setTimeout(callback, ms) { state.timers.push({ callback, ms }); return { unref() {} }; } });
  return { ...result, state };
}

const impersonating = (email) => ({
  type: "impersonated_service_account",
  service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:generateAccessToken`,
});
const PRIMARY_SA = "firebase-adminsdk-fbsvc@reward-planners-2324d.iam.gserviceaccount.com";

test("ADC push is enabled only after a token is obtained, and the token is never kept", async () => {
  const { exports, state } = loadAdcFirebase({ adcFile: impersonating(PRIMARY_SA), tokens: [async () => ({ access_token: "ya29.secret-token" })] });
  assert.equal(exports.firebaseStatus.enabled, false);
  await exports.firebaseReady;
  assert.equal(exports.firebaseStatus.enabled, true);
  assert.equal(exports.firebaseStatus.credentialCheck, "verified");
  assert.equal(exports.firebaseStatus.serviceAccountEmail, PRIMARY_SA);
  assert.doesNotMatch(JSON.stringify(exports.firebaseStatus), /secret-token/);
  assert.equal(state.initialized, 1);
});

test("failed ADC stays disabled, is re-checked, and recovers without a second app", async () => {
  const { exports, state } = loadAdcFirebase({
    adcFile: impersonating(PRIMARY_SA),
    tokens: [async () => { throw new Error("Could not load the default credentials.\nmore"); }, async () => ({ access_token: "t" })],
  });
  await exports.firebaseReady;
  assert.equal(exports.firebaseStatus.enabled, false);
  assert.equal(exports.firebaseStatus.credentialCheck, "failed");
  assert.match(exports.firebaseStatus.reason, /\(Could not load the default credentials\.\)\. For local development run: gcloud/);
  assert.equal(state.timers.length, 1);
  assert.equal(state.timers[0].ms, 5 * 60 * 1000);

  state.timers[0].callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(exports.firebaseStatus.enabled, true);
  assert.equal(exports.firebaseStatus.reason, null);
  assert.equal(state.initialized, 1);
});

test("a re-check refuses ADC that now impersonates another project's service account", async () => {
  const { exports, state } = loadAdcFirebase({
    adcFile: null,
    tokens: [async () => { throw new Error("Could not load the default credentials."); }, async () => assert.fail("must not request a token")],
  });
  await exports.firebaseReady;
  state.adcFile = impersonating("firebase-adminsdk-x@rewardplanners-ebbe4.iam.gserviceaccount.com");
  await exports.verifyPrimaryCredentials();
  assert.equal(exports.firebaseStatus.enabled, false);
  assert.match(exports.firebaseStatus.reason, /project mismatch.*rewardplanners-ebbe4/);
  assert.equal(state.tokenCalls, 1);
});

const LEGACY_ADC = { FIREBASE_LEGACY_CREDENTIAL_MODE: "application_default", FIREBASE_LEGACY_PROJECT_ID: "rewardplanners-ebbe4" };
const iamResponse = (permissions) => async (url, init) => {
  assert.match(url, /\/v1\/projects\/rewardplanners-ebbe4:testIamPermissions$/);
  assert.deepEqual(JSON.parse(init.body), { permissions: ["cloudmessaging.messages.create"] });
  return { status: 200, async json() { return { permissions }; } };
};

test("keyless legacy app targets the legacy project and is enabled only when IAM grants FCM send", async () => {
  const { exports, state } = loadAdcFirebase({
    adcFile: impersonating(PRIMARY_SA), env: LEGACY_ADC, tokens: [async () => ({ access_token: "t" }), async () => ({ access_token: "t" })],
    fetch: iamResponse(["cloudmessaging.messages.create"]),
  });
  assert.equal(exports.legacyFirebaseStatus.enabled, false);
  await Promise.all([exports.firebaseReady, exports.legacyFirebaseReady]);
  assert.equal(state.legacy.projectId, "rewardplanners-ebbe4");
  assert.equal(exports.legacyFirebaseStatus.enabled, true);
  assert.equal(exports.legacyFirebaseStatus.credentialCheck, "verified");
  assert.deepEqual(state.apps, ["[DEFAULT]", "legacy"]);
  assert.ok(exports.knownProjectIds().has("rewardplanners-ebbe4"));
});

test("keyless legacy app stays disabled with an actionable reason when the permission is missing", async () => {
  const { exports, state } = loadAdcFirebase({
    adcFile: impersonating(PRIMARY_SA), env: LEGACY_ADC, tokens: [async () => ({ access_token: "t" }), async () => ({ access_token: "t" })],
    fetch: iamResponse([]),
  });
  await Promise.all([exports.firebaseReady, exports.legacyFirebaseReady]);
  assert.equal(exports.firebaseStatus.enabled, true);
  assert.equal(exports.legacyFirebaseStatus.enabled, false);
  assert.equal(exports.legacyFirebaseStatus.credentialCheck, "failed");
  assert.match(exports.legacyFirebaseStatus.reason, /lacks cloudmessaging\.messages\.create on legacy project "rewardplanners-ebbe4".*roles\/firebasecloudmessaging\.admin/);
  assert.ok(state.timers.some((timer) => timer.ms === 5 * 60 * 1000));
});

test("keyless legacy mode rejects a missing or primary legacy project id", () => {
  const missing = loadAdcFirebase({ adcFile: impersonating(PRIMARY_SA), env: { FIREBASE_LEGACY_CREDENTIAL_MODE: "application_default" }, tokens: [async () => ({ access_token: "t" })] });
  assert.match(missing.exports.legacyFirebaseStatus.reason, /requires FIREBASE_LEGACY_PROJECT_ID/);
  const primary = loadAdcFirebase({ adcFile: impersonating(PRIMARY_SA), env: { FIREBASE_LEGACY_CREDENTIAL_MODE: "application_default", FIREBASE_LEGACY_PROJECT_ID: "reward-planners-2324d" }, tokens: [async () => ({ access_token: "t" })] });
  assert.match(primary.exports.legacyFirebaseStatus.reason, /is the primary project/);
  assert.deepEqual(primary.state.apps, ["[DEFAULT]"]);
});

test("a legacy key for a different project than FIREBASE_LEGACY_PROJECT_ID is rejected", () => {
  const key = JSON.stringify({ type: "service_account", project_id: "some-other-project", client_email: "x@some-other-project.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n" });
  const { exports, state } = loadAdcFirebase({
    adcFile: impersonating(PRIMARY_SA), env: { FIREBASE_LEGACY_PROJECT_ID: "rewardplanners-ebbe4", FIREBASE_LEGACY_SERVICE_ACCOUNT: key },
    tokens: [async () => ({ access_token: "t" })], cert: () => ({}),
  });
  assert.equal(exports.legacyFirebaseStatus.enabled, false);
  assert.match(exports.legacyFirebaseStatus.reason, /Legacy Firebase project mismatch/);
  assert.deepEqual(state.apps, ["[DEFAULT]"]);
});
