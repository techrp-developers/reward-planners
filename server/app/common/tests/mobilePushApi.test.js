const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const jwt = require("jsonwebtoken");

// Mobile push APIs: auth middleware, logout device cleanup, inbox paging.
// MySQL and Firebase are replaced before anything loads.
const SECRET = "unit-test-secret";
process.env.ACCESS_TOKEN_SECRET = SECRET;

const queries = [];
let respond = () => [[]];
const fakeDb = {
  query: async (sql, params) => { queries.push({ sql, params }); return respond(sql, params); },
  execute: async (sql, params) => { queries.push({ sql, params }); return respond(sql, params); },
  getConnection: async () => assert.fail("no transactions expected"),
};
const stub = (relative, exports) => {
  const file = require.resolve(path.join(__dirname, relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub("../../../config/database", fakeDb);
stub("../../../config/firebase", {
  firebaseStatus: { enabled: true, projectId: "reward-planners-2324d" },
  legacyFirebaseStatus: { enabled: false },
  knownProjectIds: () => new Set(["reward-planners-2324d", "rewardplanners-ebbe4"]),
});

const auth = require("../middlewares/auth");
const authController = require("../controller/authController");
const notificationController = require("../controller/notificationController");

const ACTIVE_USER = { user_id: 100, status: 1, email: "e@test.invalid" };
const respondWithUser = (sql) => (/FROM customer/i.test(sql) && /user_id = \?/.test(sql) ? [[ACTIVE_USER]] : [[]]);

function response() {
  return {
    statusCode: 200, body: null, cookies: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie() { return this; }, clearCookie() { return this; },
  };
}
async function runAuth(token, env = {}) {
  const saved = { NODE_ENV: process.env.NODE_ENV, ALLOW_UNVERIFIED_DEV_TOKENS: process.env.ALLOW_UNVERIFIED_DEV_TOKENS };
  Object.assign(process.env, { NODE_ENV: "production", ALLOW_UNVERIFIED_DEV_TOKENS: "", ...env });
  try {
    respond = respondWithUser;
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = response();
    let passed = false;
    await auth(req, res, () => { passed = true; });
    return { passed, res, req };
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

/* ---------------- auth middleware ---------------- */

test("a correctly signed access token authenticates the employee", async () => {
  const { passed, req } = await runAuth(jwt.sign({ user_id: 100 }, SECRET, { expiresIn: "5m" }));
  assert.equal(passed, true);
  assert.equal(req.user.user_id, 100);
});

test("forged, wrongly signed, unsigned and expired tokens are rejected", async () => {
  const tokens = {
    wrongSecret: jwt.sign({ user_id: 100 }, "attacker-secret"),
    unsigned: jwt.sign({ user_id: 100 }, null, { algorithm: "none" }),
    expired: jwt.sign({ user_id: 100, exp: Math.floor(Date.now() / 1000) - 60 }, SECRET),
    garbage: "not-a-jwt",
  };
  for (const [name, token] of Object.entries(tokens)) {
    const { passed, res } = await runAuth(token);
    assert.equal(passed, false, name);
    assert.equal(res.statusCode, 401, name);
  }
});

test("the unverified-token shortcut needs BOTH development mode and the explicit flag", async () => {
  const foreign = jwt.sign({ user_id: 100 }, "production-secret");
  assert.equal((await runAuth(foreign, { NODE_ENV: "development" })).passed, false, "development alone");
  assert.equal((await runAuth(foreign, { ALLOW_UNVERIFIED_DEV_TOKENS: "true" })).passed, false, "flag alone (production)");
  assert.equal((await runAuth(foreign, { NODE_ENV: "development", ALLOW_UNVERIFIED_DEV_TOKENS: "true" })).passed, true, "both");
  assert.equal(auth.unverifiedDevTokensAllowed({ NODE_ENV: "test", ALLOW_UNVERIFIED_DEV_TOKENS: "true" }), false);
});

/* ---------------- logout device cleanup ---------------- */

async function logout({ user = null, body = {} }) {
  queries.length = 0;
  respond = (sql) => (/FROM customer_auth_sessions/.test(sql) ? [[{ user_id: 100 }]] : [{ affectedRows: 1 }]);
  const res = response();
  await authController.logoutUser({ user, body, headers: {}, get: () => "" }, res);
  return { res, writes: queries.filter((entry) => /^\s*UPDATE (user_push_tokens|customer) /.test(entry.sql)) };
}

test("logout with a live session stops pushes to the reported device only", async () => {
  const { res, writes } = await logout({ user: { user_id: 100 }, body: { refreshToken: "r", fcm_token: "device-token-A" } });
  assert.equal(res.body.success, true);
  assert.ok(writes.length >= 1);
  assert.ok(writes.every((entry) => /user_id = \? AND fcm_token = \?/.test(entry.sql)));
  assert.deepEqual(writes[0].params, [100, "device-token-A"]);
});

test("logout with an expired access token still identifies the employee from the refresh session", async () => {
  // Today's app sends only refreshToken; before this fix nothing was deactivated.
  const { writes } = await logout({ user: null, body: { refreshToken: "r" } });
  assert.ok(writes.some((entry) => /UPDATE user_push_tokens SET is_active = 0/.test(entry.sql) && entry.params[0] === 100));
});

test("logout with no usable session deactivates only the device that proves it holds the token", async () => {
  queries.length = 0;
  respond = () => [[]]; // no session row
  const res = response();
  await authController.logoutUser({ user: null, body: { fcm_token: "device-token-B" }, headers: {}, get: () => "" }, res);
  const writes = queries.filter((entry) => /^\s*UPDATE (user_push_tokens|customer) /.test(entry.sql));
  assert.equal(writes.length, 2);
  assert.ok(writes.every((entry) => /WHERE fcm_token = \?$/.test(entry.sql.trim()) && entry.params[0] === "device-token-B"));
});

test("logout with nothing to identify a user or device changes no tokens", async () => {
  queries.length = 0;
  respond = () => [[]];
  const res = response();
  await authController.logoutUser({ user: null, body: {}, headers: {}, get: () => "" }, res);
  assert.equal(res.body.success, true);
  assert.equal(queries.filter((entry) => /UPDATE (user_push_tokens|customer) /.test(entry.sql)).length, 0);
});

/* ---------------- token registration ---------------- */

test("update-fcm-token validates input and stores only known Firebase project ids", async () => {
  const call = async (body) => {
    queries.length = 0;
    respond = () => [{ affectedRows: 1 }];
    const res = response();
    await authController.updateFcmToken({ user: { user_id: 100 }, body }, res);
    return { res, upsert: queries.find((entry) => /INSERT INTO user_push_tokens/.test(entry.sql)) };
  };
  assert.equal((await call({})).res.statusCode, 400);
  assert.equal((await call({ fcm_token: "x".repeat(513) })).res.statusCode, 400);
  assert.equal((await call({ fcm_token: "t", device_platform: "windows" })).res.statusCode, 400);

  const known = await call({ fcm_token: "t1", device_platform: "android", firebase_project_id: "reward-planners-2324d" });
  assert.equal(known.res.body.firebase_project_id, "reward-planners-2324d");
  assert.deepEqual(known.upsert.params, [100, "t1", "android", "reward-planners-2324d"]);

  const unknown = await call({ fcm_token: "t2", device_platform: "android", firebase_project_id: "someone-elses-project" });
  assert.equal(unknown.res.body.firebase_project_id, null);
});

test("update-fcm-token matches the mobile contract and keeps devices isolated per employee", async () => {
  const register = async (userId, body) => {
    queries.length = 0;
    respond = () => [{ affectedRows: 1 }];
    const res = response();
    await authController.updateFcmToken({ user: { user_id: userId }, body }, res);
    return { res, sql: queries.map((entry) => ({ sql: entry.sql.replace(/\s+/g, " "), params: entry.params })) };
  };
  const body = { fcm_token: "device-A", device_platform: "android", firebase_project_id: "reward-planners-2324d" };

  const { res, sql } = await register(100, body);
  assert.deepEqual(res.body, { success: true, message: "FCM token updated", firebase_project_id: "reward-planners-2324d" });

  // Owner comes from the verified access token, never from the request body.
  const spoofed = await register(100, { ...body, user_id: 999 });
  assert.ok(spoofed.sql.every((entry) => !entry.params.includes(999)));

  // Upsert keyed on the unique token: a refresh re-activates, a second phone adds a row,
  // and a phone that changes hands moves to the new employee.
  const upsert = sql.find((entry) => /INSERT INTO user_push_tokens/.test(entry.sql));
  assert.match(upsert.sql, /ON DUPLICATE KEY UPDATE user_id = VALUES\(user_id\).*is_active = 1/);
  assert.doesNotMatch(upsert.sql, /WHERE user_id/, "registering one device never touches the employee's other devices");
  const legacyCleanup = sql.find((entry) => /fcm_token = NULL WHERE fcm_token = \? AND user_id <> \?/.test(entry.sql));
  assert.deepEqual(legacyCleanup.params, ["device-A", 100]);

  // Legacy builds (no project id) never overwrite a known project with a guess.
  const legacy = await register(100, { fcm_token: "device-B" });
  assert.equal(legacy.res.body.firebase_project_id, null);
  assert.match(legacy.sql[0].sql, /firebase_project_id = COALESCE\(VALUES\(firebase_project_id\), firebase_project_id\)/);
});

/* ---------------- inbox paging ---------------- */

test("my-notification pages with before_id and rejects invalid values", async () => {
  const list = async (query) => {
    queries.length = 0;
    respond = () => [[]];
    const res = response();
    await notificationController.getMyNotifications({ user: { user_id: 100 }, query }, res);
    return { res, select: queries.find((entry) => /FROM notifications/.test(entry.sql)) };
  };
  const first = await list({ limit: "20" });
  assert.equal(first.res.body.success, true);
  assert.doesNotMatch(first.select.sql, /notification_id < \?/);
  assert.deepEqual(first.select.params, [100, 20]);

  const older = await list({ limit: "20", before_id: "5000" });
  assert.match(older.select.sql, /user_id = \? AND notification_id < \?/);
  assert.deepEqual(older.select.params, [100, 5000, 20]);

  for (const bad of ["abc", "0", "-1", "1.5"]) {
    assert.equal((await list({ before_id: bad })).res.statusCode, 400, bad);
  }
});
