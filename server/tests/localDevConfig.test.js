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
