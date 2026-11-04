// Test sender and logout against a real, DISPOSABLE MariaDB database.
//
//   npm run test:push-logout:db
//
// Creates rp_test_push_<random> on the configured server, copies only the
// STRUCTURE of the tables involved (CREATE TABLE ... LIKE, no rows), seeds
// synthetic data and drops the database afterwards. Requests go over HTTP
// through the real routers and auth middleware. Every FCM send() lands in an
// array; nothing leaves the machine.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const SERVER = path.join(__dirname, "../..");
require("dotenv").config({ path: path.join(SERVER, ".env"), quiet: true });
const mysql = require("mysql2/promise");

const ENABLED = process.env.RP_DISPOSABLE_DB_TESTS === "1" || process.env.npm_lifecycle_event === "test:push-logout:db";
const SOURCE_DB = process.env.DB_NAME || "rewardplanners_db";
const TEST_DB = `rp_test_push_${crypto.randomBytes(4).toString("hex")}`;
const TABLES = ["eusers", "customer", "customer_auth_sessions", "user_push_tokens", "notification_preferences", "notifications",
  "notification_push_attempts", "notification_campaign_audit_logs", "vendors", "hr_account_approvals", "company_users"];
const SAFE_NAME = /^rp_test_push_[0-9a-f]{8}$/;
const PROJECT = "reward-planners-2324d";
const token = (id) => `synthetic-token-${id}-${"x".repeat(40)}`;

if (!ENABLED) {
  test("disposable-database push and logout tests", { skip: "set RP_DISPOSABLE_DB_TESTS=1 (npm run test:push-logout:db)" }, () => {});
} else {
  let admin;
  let db;
  let server;
  let base;
  let jwt;
  const firebase = { enabled: true, projectId: PROJECT };
  const fcmSends = [];
  let fcmFailure = null;

  const rows = async (sql, params = []) => (await admin.query(sql, params))[0];
  const activeIds = async (userId) => (await rows("SELECT id FROM user_push_tokens WHERE user_id = ? AND is_active = 1 ORDER BY id", [userId])).map((row) => Number(row.id));
  const sessionRevoked = async (raw) => Boolean((await rows("SELECT revoked_at FROM customer_auth_sessions WHERE token_hash = ?", [hash(raw)]))[0].revoked_at);
  const hash = (raw) => crypto.createHash("sha256").update(raw).digest("hex");
  const audits = (action) => rows("SELECT * FROM notification_campaign_audit_logs WHERE action = ? ORDER BY audit_id", [action]);

  async function seedDevices(userId, devices) {
    await admin.query("DELETE FROM user_push_tokens WHERE user_id = ?", [userId]);
    for (const [id, platform, project] of devices) {
      await admin.query(
        "INSERT INTO user_push_tokens (id, user_id, fcm_token, platform, is_active, last_seen_at, firebase_project_id) VALUES (?, ?, ?, ?, 1, NOW(), ?)",
        [id, userId, token(id), platform, project],
      );
    }
  }
  async function seedSession(userId, raw, { revoked = false, expired = false } = {}) {
    await admin.query(
      `INSERT INTO customer_auth_sessions (user_id, token_hash, family_id, expires_at, revoked_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ${revoked ? "NOW()" : "NULL"})`,
      [userId, hash(raw), crypto.randomUUID(), expired ? -1 : 30],
    );
  }

  const post = async (url, { bearer, body = {} } = {}) => {
    const response = await fetch(`${base}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const rmToken = (userId) => jwt.sign({ user_id: userId, type: "access" }, process.env.JWT_SECRET, { expiresIn: "5m" });
  const customerToken = (userId) => jwt.sign({ user_id: userId, type: "access" }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "5m" });
  const logout = (bearerUser, body) => post("/v1/auth/logout", { bearer: bearerUser ? customerToken(bearerUser) : undefined, body });

  test.before(async () => {
    assert.match(TEST_DB, SAFE_NAME);
    assert.notEqual(TEST_DB, SOURCE_DB);
    assert.ok(process.env.JWT_SECRET && process.env.ACCESS_TOKEN_SECRET, "signing secrets must be configured");
    admin = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      multipleStatements: false,
    });
    await admin.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4`);
    for (const table of TABLES) {
      await admin.query(`CREATE TABLE \`${TEST_DB}\`.\`${table}\` LIKE \`${SOURCE_DB}\`.\`${table}\``);
    }
    await admin.query(`USE \`${TEST_DB}\``);
    // One RM per request that reaches the 1-per-minute limiter.
    const rms = Array.from({ length: 12 }, (_, index) => `(${31 + index}, 'RM ${index}', 'rm${index}@test.invalid', 'rm', 1)`).join(", ");
    await admin.query(
      `INSERT INTO eusers (user_id, name, email, role, is_verified) VALUES
       (7, 'Admin', 'admin@test.invalid', 'admin', 1), (19, 'RM Unverified', 'rm-u@test.invalid', 'rm', 0), ${rms}`,
    );
    await admin.query(`INSERT INTO customer (user_id, name, password, status) VALUES (3, 'Test Employee', 'x', 1), (9, 'Other Employee', 'x', 1)`);

    process.env.DB_NAME = TEST_DB;
    process.env.NODE_ENV = "development";
    process.env.NOTIFICATION_TEST_USER_IDS = "3";
    const replace = (file, exports) => { require.cache[file] = { id: file, filename: file, loaded: true, exports }; };
    replace(require.resolve("firebase-admin/messaging", { paths: [SERVER] }), {
      getMessaging: () => ({
        send: async (message, dryRun) => {
          assert.equal(dryRun, undefined);
          fcmSends.push(message);
          if (fcmFailure) throw fcmFailure;
          return `projects/${PROJECT}/messages/test-${fcmSends.length}`;
        },
      }),
    });
    replace(require.resolve(path.join(SERVER, "config/firebase")), { firebaseStatus: firebase, legacyFirebaseStatus: { enabled: false }, knownProjectIds: () => new Set([PROJECT]) });
    // Requiring this module would schedule a real cron job.
    replace(require.resolve(path.join(SERVER, "services/Todo/birthdayReminderCron")), { sendBirthdayWishes: async () => {} });

    db = require(path.join(SERVER, "config/database"));
    const [[{ name }]] = await db.query("SELECT DATABASE() AS name");
    assert.equal(name, TEST_DB, "application pool must use the disposable database");

    jwt = require(path.join(SERVER, "node_modules/jsonwebtoken"));
    const express = require(path.join(SERVER, "node_modules/express"));
    const app = express();
    app.use(express.json());
    app.use("/v1/auth", require(path.join(SERVER, "app/common/routes/authRoute")));
    app.use("/api/wa", require(path.join(SERVER, "routes/waTestRoute")));
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  test.beforeEach(async () => {
    fcmSends.length = 0;
    fcmFailure = null;
    firebase.enabled = true;
    await seedDevices(3, [[985, "android", null], [1703, "android", PROJECT], [1713, "android", PROJECT], [1717, "ios", PROJECT]]);
    await seedDevices(9, [[2000, "ios", PROJECT], [2001, "android", PROJECT]]);
    await admin.query("UPDATE customer SET fcm_token = ? WHERE user_id = 3", [token(1717)]);
    await admin.query("UPDATE customer SET fcm_token = ? WHERE user_id = 9", [token(2000)]);
  });

  test.after(async () => {
    server?.close();
    await db?.end().catch(() => {});
    if (admin) {
      if (SAFE_NAME.test(TEST_DB)) await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
      await admin.end();
    }
  });

  /* ---------------- test sender ---------------- */

  test("iOS: one APNs alert to device 1717 only, with an inbox row, attempt row and audit entry", async () => {
    const result = await post("/api/wa/test-push/3", { bearer: rmToken(31), body: { device_id: 1717 } });
    assert.equal(result.status, 200);
    assert.equal(result.body.device.id, 1717);
    assert.equal(fcmSends.length, 1);
    const [message] = fcmSends;
    assert.equal(message.token, token(1717));
    assert.equal(message.android, undefined);
    assert.doesNotMatch(JSON.stringify(message), /android|channelId|ic_stat/i);
    assert.equal(message.apns.headers["apns-topic"], "com.mpstech.rewardsplanners");
    assert.deepEqual(message.apns.payload.aps.alert, {
      title: "Reward Planners iOS Test",
      body: "Your iPhone push notification is working! Tap to open Reward Planners.",
    });
    assert.equal(message.data.screen, "Notifications");
    assert.equal(message.data.notification_id, String(result.body.notificationId));

    const [inbox] = await rows("SELECT user_id, title FROM notifications WHERE notification_id = ?", [result.body.notificationId]);
    assert.equal(Number(inbox.user_id), 3);
    assert.equal(inbox.title, "Reward Planners iOS Test");
    assert.equal((await rows("SELECT * FROM notification_push_attempts WHERE notification_id = ?", [result.body.notificationId])).length, 1);
    const [entry] = (await audits("test_push")).slice(-1);
    assert.equal(entry.decision, "allowed");
    assert.equal(JSON.parse(entry.details).device_id, 1717);
    assert.doesNotMatch(JSON.stringify(entry), /synthetic-token/);
  });

  test("Android: device 1713 keeps its channel, icon and priority alongside the iOS registration", async () => {
    const result = await post("/api/wa/test-push/3", { bearer: rmToken(32), body: { device_id: 1713 } });
    assert.equal(result.status, 200);
    assert.equal(fcmSends.length, 1);
    const [message] = fcmSends;
    assert.equal(message.token, token(1713));
    assert.equal(message.notification.title, "Reward Planners Test");
    assert.equal(message.android.notification.channelId, "reward_planners_general");
    assert.equal(message.android.notification.icon, "ic_stat_notification");
    assert.equal(message.android.priority, "high");
    assert.equal(message.data.android_channel_id, "reward_planners_general");
    assert.equal(message.apns.headers["apns-topic"], undefined);
    assert.equal(result.body.androidPriority, "high");
  });

  test("no device_id with several devices is refused, so no device is guessed", async () => {
    const result = await post("/api/wa/test-push/3", { bearer: rmToken(33) });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "DEVICE_NOT_UNIQUE");
    assert.equal(fcmSends.length, 0);
  });

  test("another employee's device is refused", async () => {
    const result = await post("/api/wa/test-push/3", { bearer: rmToken(34), body: { device_id: 2000 } });
    assert.equal(result.status, 404);
    assert.equal(result.body.code, "DEVICE_NOT_FOUND");
    assert.equal(fcmSends.length, 0);
  });

  test("a device outside the primary Firebase project is refused", async () => {
    const result = await post("/api/wa/test-push/3", { bearer: rmToken(35), body: { device_id: 985 } });
    assert.equal(result.status, 404);
    assert.equal(fcmSends.length, 0);
    await admin.query("UPDATE user_push_tokens SET firebase_project_id = 'rewardplanners-ebbe4' WHERE id = 1703");
    assert.equal((await post("/api/wa/test-push/3", { bearer: rmToken(36), body: { device_id: 1703 } })).status, 404);
    assert.equal(fcmSends.length, 0);
  });

  test("an employee outside the allow-list is refused", async () => {
    const result = await post("/api/wa/test-push/9", { bearer: rmToken(37), body: { device_id: 2000 } });
    assert.equal(result.status, 403);
    assert.equal(result.body.code, "NOT_A_TEST_USER");
    assert.equal(fcmSends.length, 0);
  });

  test("admins and unverified RMs are refused", async () => {
    assert.equal((await post("/api/wa/test-push/3", { bearer: rmToken(7), body: { device_id: 1717 } })).status, 403);
    assert.equal((await post("/api/wa/test-push/3", { bearer: rmToken(19), body: { device_id: 1717 } })).status, 403);
    assert.equal(fcmSends.length, 0);
  });

  test("missing, forged, unsigned and expired sessions are refused", async () => {
    const forged = jwt.sign({ user_id: 31, type: "access" }, "attacker-secret");
    const unsigned = jwt.sign({ user_id: 31, type: "access" }, null, { algorithm: "none" });
    const expired = jwt.sign({ user_id: 31, type: "access" }, process.env.JWT_SECRET, { expiresIn: -60 });
    for (const bearer of [undefined, forged, unsigned, expired]) {
      assert.equal((await post("/api/wa/test-push/3", { bearer, body: { device_id: 1717 } })).status, 401);
    }
    assert.equal(fcmSends.length, 0);
  });

  test("Firebase unavailable: refused before any inbox row or send", async () => {
    firebase.enabled = false;
    const before = (await rows("SELECT COUNT(*) AS n FROM notifications"))[0].n;
    const result = await post("/api/wa/test-push/3", { bearer: rmToken(38), body: { device_id: 1717 } });
    assert.equal(result.status, 503);
    assert.equal(result.body.code, "FIREBASE_UNAVAILABLE");
    assert.equal(fcmSends.length, 0);
    assert.equal((await rows("SELECT COUNT(*) AS n FROM notifications"))[0].n, before);
  });

  test("one request per minute per RM", async () => {
    const bearer = rmToken(39);
    assert.equal((await post("/api/wa/test-push/3", { bearer, body: { device_id: 1717 } })).status, 200);
    assert.equal((await post("/api/wa/test-push/3", { bearer, body: { device_id: 1717 } })).status, 429);
    assert.equal(fcmSends.length, 1);
  });

  test("a rejected send is tried once, never retried, and its audit entry is stored", async () => {
    fcmFailure = Object.assign(new Error("socket hang up"), { code: "app/network-error" });
    const result = await post("/api/wa/test-push/3", { bearer: rmToken(40), body: { device_id: 1717 } });
    assert.equal(result.status, 502);
    assert.equal(fcmSends.length, 1);
    const [entry] = (await audits("test_push")).slice(-1);
    assert.equal(entry.decision, "denied");
    const details = JSON.parse(entry.details);
    assert.equal(details.outcome, "failed");
    assert.equal(details.error_code, "app/network-error");
  });

  /* ---------------- logout ---------------- */

  test("device scope with an owned token: only that device and only this session", async () => {
    await seedSession(3, "dev-session");
    await seedSession(3, "other-phone-session");
    const result = await logout(3, { refreshToken: "dev-session", fcm_token: token(1717), push_scope: "device" });
    assert.equal(result.status, 200);
    assert.equal(result.body.device_token_deactivated, true);
    assert.equal(result.body.session_revoked, true);
    assert.deepEqual(await activeIds(3), [985, 1703, 1713]);
    assert.equal(await sessionRevoked("dev-session"), true);
    assert.equal(await sessionRevoked("other-phone-session"), false);
    assert.equal((await rows("SELECT fcm_token FROM customer WHERE user_id = 3"))[0].fcm_token, null);
    assert.equal((await post("/v1/auth/refresh", { body: { refreshToken: "dev-session" } })).status, 401);
    const [entry] = (await audits("logout_device")).slice(-1);
    assert.doesNotMatch(JSON.stringify(entry), /synthetic-token|dev-session/);
  });

  test("device scope with no token: session revoked, every device kept, and the result says so", async () => {
    await seedSession(3, "no-token-session");
    const result = await logout(3, { refreshToken: "no-token-session", fcm_token: null, push_scope: "device" });
    assert.equal(result.status, 200);
    assert.equal(result.body.session_revoked, true);
    assert.equal(result.body.device_token_deactivated, false);
    assert.deepEqual(await activeIds(3), [985, 1703, 1713, 1717]);
    assert.equal(await sessionRevoked("no-token-session"), true);
  });

  test("device scope with an expired access token still works from the refresh session", async () => {
    await seedSession(3, "refresh-only-session");
    const result = await logout(null, { refreshToken: "refresh-only-session", fcm_token: token(1703), push_scope: "device" });
    assert.equal(result.body.device_token_deactivated, true);
    assert.deepEqual(await activeIds(3), [985, 1713, 1717]);
  });

  test("a token of another account is never deactivated", async () => {
    await seedSession(3, "cross-session");
    const result = await logout(3, { refreshToken: "cross-session", fcm_token: token(2000), push_scope: "device" });
    assert.equal(result.status, 200);
    assert.equal(result.body.device_token_deactivated, false);
    assert.deepEqual(await activeIds(9), [2000, 2001]);
    assert.equal((await rows("SELECT fcm_token FROM customer WHERE user_id = 9"))[0].fcm_token, token(2000));
  });

  test("a refresh session of another account is refused and left live", async () => {
    await seedSession(9, "victim-session");
    const result = await logout(3, { refreshToken: "victim-session", fcm_token: token(1717), push_scope: "device" });
    assert.equal(result.status, 403);
    assert.equal(await sessionRevoked("victim-session"), false);
    assert.deepEqual(await activeIds(3), [985, 1703, 1713, 1717]);
  });

  test("all_devices: every device and session of this user, nobody else's", async () => {
    await seedSession(3, "all-1");
    await seedSession(3, "all-2");
    await seedSession(9, "bystander");
    const result = await logout(3, { refreshToken: "all-1", push_scope: "all_devices" });
    assert.equal(result.status, 200);
    assert.equal(result.body.devices_deactivated, 4);
    assert.ok(result.body.sessions_revoked >= 2);
    assert.deepEqual(await activeIds(3), []);
    assert.equal(await sessionRevoked("all-1"), true);
    assert.equal(await sessionRevoked("all-2"), true);
    assert.equal(await sessionRevoked("bystander"), false);
    assert.deepEqual(await activeIds(9), [2000, 2001]);
    assert.equal(JSON.parse((await audits("logout_all_devices")).slice(-1)[0].details).devices_deactivated, 4);
  });

  test("all_devices without proof changes nothing", async () => {
    await seedSession(3, "live-for-denied");
    await seedSession(3, "already-revoked", { revoked: true });
    await seedSession(3, "already-expired", { expired: true });
    await seedSession(9, "someone-else");
    const attempts = [
      [null, "live-for-denied", 401], // refresh token alone
      [3, "already-revoked", 403],
      [3, "already-expired", 403],
      [3, "someone-else", 403],
      [3, undefined, 403],
    ];
    for (const [bearerUser, refreshToken, status] of attempts) {
      assert.equal((await logout(bearerUser, { refreshToken, push_scope: "all_devices", user_id: 3 })).status, status);
    }
    const forged = jwt.sign({ user_id: 3, type: "access" }, "attacker-secret");
    assert.equal((await post("/v1/auth/logout", { bearer: forged, body: { refreshToken: "live-for-denied", push_scope: "all_devices" } })).status, 401);
    assert.deepEqual(await activeIds(3), [985, 1703, 1713, 1717]);
    assert.equal(await sessionRevoked("live-for-denied"), false);
  });

  test("released builds, no push_scope: token, placeholder and refresh-only all keep their behaviour", async () => {
    await seedSession(3, "legacy-token");
    const withToken = await logout(3, { refreshToken: "legacy-token", fcm_token: token(1713) });
    assert.deepEqual(Object.keys(withToken.body).sort(), ["message", "success"]);
    assert.deepEqual(await activeIds(3), [985, 1703, 1717]);

    await seedSession(3, "legacy-placeholder");
    await logout(3, { refreshToken: "legacy-placeholder", fcm_token: "no-device-token" });
    assert.deepEqual(await activeIds(3), [985, 1703, 1717]);
    assert.equal(await sessionRevoked("legacy-placeholder"), true);

    await seedSession(3, "legacy-none");
    await logout(null, { refreshToken: "legacy-none" });
    assert.deepEqual(await activeIds(3), []);
    assert.deepEqual(await activeIds(9), [2000, 2001]);

    const states = (await audits("logout_unscoped")).slice(-3).map((entry) => JSON.parse(entry.details).token_state);
    assert.deepEqual(states, ["token", "placeholder", "none"]);
  });

  test("Android and iOS tokens of one employee coexist through a logout and a re-registration", async () => {
    await seedSession(3, "coexist");
    await logout(3, { refreshToken: "coexist", fcm_token: token(1717), push_scope: "device" });
    assert.deepEqual(await activeIds(3), [985, 1703, 1713]);
    const result = await post("/api/wa/test-push/3", { bearer: rmToken(41), body: { device_id: 1717 } });
    assert.equal(result.status, 404); // a logged-out device is no longer a target
    assert.equal(fcmSends.length, 0);
    const android = await post("/api/wa/test-push/3", { bearer: rmToken(42), body: { device_id: 1713 } });
    assert.equal(android.status, 200);
    assert.deepEqual(fcmSends.map((message) => message.token), [token(1713)]);
  });
}
