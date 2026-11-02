const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// Request handling of POST /v1/auth/logout. MySQL is replaced; the same rules
// run against a real disposable database in tests/integration/pushLogout.db.test.js.
const queries = [];
let session = null;
const fakeDb = {
  query: async (sql, params) => { queries.push({ sql, params }); return [{ affectedRows: 0 }]; },
  execute: async (sql, params) => {
    queries.push({ sql, params });
    if (/FROM customer_auth_sessions/.test(sql)) return [session ? [session] : []];
    return [{ affectedRows: 1 }];
  },
  getConnection: async () => assert.fail("no transactions expected"),
};
const stub = (relative, exports) => {
  const file = require.resolve(path.join(__dirname, relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub("../../../config/database", fakeDb);
stub("../../../config/firebase", { firebaseStatus: { enabled: false }, legacyFirebaseStatus: { enabled: false }, knownProjectIds: () => new Set() });

const authController = require("../controller/authController");

const LIVE = { user_id: 100, revoked_at: null, expires_at: new Date(Date.now() + 86400000) };

async function logout({ user = null, body = {}, stored = null }) {
  queries.length = 0;
  session = stored;
  const res = {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    cookie() { return this; }, clearCookie() { return this; },
  };
  await authController.logoutUser({ user, body, headers: {}, get: () => "agent/1.0", ip: "127.0.0.1" }, res);
  return {
    res,
    tokenWrites: queries.filter((entry) => /UPDATE (user_push_tokens|customer) /.test(entry.sql)),
    sessionWrites: queries.filter((entry) => /UPDATE customer_auth_sessions/.test(entry.sql)),
    auditRows: queries.filter((entry) => /INSERT INTO notification_campaign_audit_logs/.test(entry.sql)),
  };
}

test("an unknown push_scope is refused and changes nothing", async () => {
  const { res, tokenWrites, sessionWrites } = await logout({ user: { user_id: 100 }, stored: LIVE, body: { refreshToken: "r", push_scope: "everything" } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "INVALID_PUSH_SCOPE");
  assert.equal(tokenWrites.length + sessionWrites.length, 0);
});

test("device scope without a token, or with the app's placeholder, never touches push tokens", async () => {
  for (const fcm_token of [undefined, null, "", "no-device-token"]) {
    const { res, tokenWrites, sessionWrites } = await logout({ user: { user_id: 100 }, stored: LIVE, body: { refreshToken: "r", fcm_token, push_scope: "device" } });
    assert.equal(res.body.success, true);
    assert.equal(res.body.session_revoked, true);
    assert.equal(res.body.device_token_deactivated, false);
    assert.equal(tokenWrites.length, 0, String(fcm_token));
    assert.equal(sessionWrites.length, 1);
  }
});

test("device scope limits the write to the authenticated user's token and audits no token value", async () => {
  const { res, tokenWrites, auditRows } = await logout({ user: { user_id: 100 }, stored: LIVE, body: { refreshToken: "r", fcm_token: "device-token-A", push_scope: "device" } });
  assert.equal(res.body.device_token_deactivated, true);
  assert.ok(tokenWrites.every((entry) => /user_id = \? AND fcm_token = \?/.test(entry.sql)));
  assert.deepEqual(tokenWrites[0].params, [100, "device-token-A"]);
  assert.equal(auditRows.length, 1);
  assert.doesNotMatch(JSON.stringify(auditRows[0].params), /device-token-A/);
});

test("a body user_id is ignored", async () => {
  const { tokenWrites } = await logout({ user: { user_id: 100 }, stored: LIVE, body: { refreshToken: "r", fcm_token: "t", push_scope: "device", user_id: 999, role: "admin" } });
  assert.equal(tokenWrites[0].params[0], 100);
});

test("a session of another account is refused before anything is revoked", async () => {
  const { res, tokenWrites, sessionWrites } = await logout({ user: { user_id: 200 }, stored: LIVE, body: { refreshToken: "r", fcm_token: "t", push_scope: "device" } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "SESSION_MISMATCH");
  assert.equal(tokenWrites.length + sessionWrites.length, 0);
});

test("all_devices refuses without a verified access token or a live session of that user", async () => {
  const body = { refreshToken: "r", push_scope: "all_devices" };
  const cases = [
    [{ user: null, stored: LIVE }, 401, "AUTH_REQUIRED"],
    [{ user: { user_id: 100 }, stored: null }, 403, "SESSION_REQUIRED"],
    [{ user: { user_id: 200 }, stored: LIVE }, 403, "SESSION_REQUIRED"],
    [{ user: { user_id: 100 }, stored: { ...LIVE, revoked_at: new Date() } }, 403, "SESSION_REQUIRED"],
    [{ user: { user_id: 100 }, stored: { ...LIVE, expires_at: new Date(0) } }, 403, "SESSION_REQUIRED"],
  ];
  for (const [input, status, code] of cases) {
    const { res, tokenWrites, sessionWrites } = await logout({ ...input, body });
    assert.equal(res.statusCode, status);
    assert.equal(res.body.code, code);
    assert.equal(tokenWrites.length + sessionWrites.length, 0);
  }
});

test("without push_scope a build that sends no token keeps today's behaviour, and is measured", async () => {
  const { res, tokenWrites, auditRows } = await logout({ stored: LIVE, body: { refreshToken: "r" } });
  assert.deepEqual(Object.keys(res.body).sort(), ["message", "success"]);
  assert.ok(tokenWrites.some((entry) => /UPDATE user_push_tokens SET is_active = 0/.test(entry.sql) && entry.params[0] === 100));
  assert.match(JSON.stringify(auditRows[0].params), /logout_unscoped/);
  assert.match(JSON.stringify(auditRows[0].params), /token_state\\":\\"none/);
});

test("without push_scope the placeholder still matches one token value only", async () => {
  const { tokenWrites, auditRows } = await logout({ stored: LIVE, body: { refreshToken: "r", fcm_token: "no-device-token" } });
  assert.ok(tokenWrites.every((entry) => /fcm_token = \?/.test(entry.sql)));
  assert.match(JSON.stringify(auditRows[0].params), /placeholder/);
});
