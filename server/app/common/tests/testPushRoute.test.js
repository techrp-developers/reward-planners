const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");

// POST /api/wa/test-push/:userId through the real router and sender, over HTTP.
// Sign-in, MySQL and FCM are replaced before anything loads.
const PROJECT = "reward-planners-2324d";
const TOKEN = "fcm-token-abcdefghijklmnopqrstuvwxyz-0123456789";
const row = (id, userId, platform, project = PROJECT) => ({ id, user_id: userId, fcm_token: `${TOKEN}-${id}`, platform, firebase_project_id: project, last_seen_at: "2026-11-02 16:00:18" });
const devices = [row(1703, 3, "android"), row(1713, 3, "android"), row(1717, 3, "ios"), row(2000, 9, "ios")];

const sent = [];
const audits = [];
let signedIn = true;
const fakeDb = {
  query: async (sql, params) => (/FROM user_push_tokens/.test(sql) ? [devices.filter((device) => device.user_id === params[0])] : [[]]),
  execute: async () => [[]],
};
const stubFile = (file, exports) => { require.cache[file] = { id: file, filename: file, loaded: true, exports }; };
const stub = (relative, exports) => stubFile(require.resolve(path.join(__dirname, relative)), exports);
const pass = (req, res, next) => next();

stub("../../../config/database", fakeDb);
stub("../../../config/firebase", { firebaseStatus: { enabled: true, projectId: PROJECT }, legacyFirebaseStatus: { enabled: false }, knownProjectIds: () => new Set([PROJECT]) });
stub("../../../middleware/auth", {
  authenticateToken: (req, res, next) => {
    if (!signedIn) return res.status(401).json({ ok: false });
    req.user = { user_id: 77, role: "rm" };
    return next();
  },
});
stub("../middlewares/requirePushNotificationManager", pass);
stub("../models/notificationAudienceModel", { getTestUserIds: () => [3] });
stub("../models/notificationCampaignModel", { audit: async (entry) => { audits.push(entry); } });
stub("../models/notificationModel", { create: async () => ({ notificationId: 9200, created: true }) });
stub("../../../services/whatsapp/waEnqueueService", { enqueueWhatsApp: async () => {} });
stub("../../../services/Todo/birthdayReminderCron", { sendBirthdayWishes: async () => {} });
stubFile(require.resolve("firebase-admin/messaging"), { getMessaging: () => ({ send: async (message) => { sent.push(message); return "projects/p/messages/1"; } }) });

const originalEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "development";
process.env.NOTIFICATION_TEST_USER_IDS = "3";
const router = require("../../../routes/waTestRoute");

let server;
let base;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/wa", router);
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/wa`;
});
test.after(() => {
  process.env.NODE_ENV = originalEnv;
  server.close();
});

const post = async (userId, body = {}) => {
  const response = await fetch(`${base}/test-push/${userId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};

// Runs in file order: the 1/minute limit lets exactly one request per RM reach
// the handler, so refusals that stop earlier come first.
test("refused before the limiter: signed-out caller and non-allow-listed employee", async () => {
  signedIn = false;
  assert.equal((await post(3, { device_id: 1717 })).status, 401);
  signedIn = true;
  const other = await post(9, { device_id: 2000 });
  assert.equal(other.status, 403);
  assert.equal(other.body.code, "NOT_A_TEST_USER");
  assert.equal(sent.length, 0);
});

test("a named iOS device gets one APNs alert; a second call in the minute is limited", async () => {
  const first = await post(3, { device_id: 1717 });
  assert.equal(first.status, 200);
  assert.equal(first.body.device.id, 1717);
  assert.equal(first.body.device.platform, "ios");
  assert.doesNotMatch(JSON.stringify(first.body), new RegExp(TOKEN));

  assert.equal(sent.length, 1);
  assert.equal(sent[0].token, `${TOKEN}-1717`);
  assert.equal(sent[0].android, undefined);
  assert.equal(sent[0].apns.headers["apns-topic"], "com.mpstech.rewardsplanners");

  const allowed = audits.find((entry) => entry.decision === "allowed");
  assert.equal(allowed.action, "test_push");
  assert.equal(allowed.details.device_id, 1717);
  assert.equal(allowed.actor.user_id, 77);

  const second = await post(3, { device_id: 1717 });
  assert.equal(second.status, 429);
  assert.equal(sent.length, 1);
});
