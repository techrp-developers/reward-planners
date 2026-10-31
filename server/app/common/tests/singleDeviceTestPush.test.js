const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// No MySQL and no Firebase in unit tests.
const stub = (relative, exports) => {
  const file = require.resolve(path.join(__dirname, relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub("../../../config/database", { query: async () => [[]], execute: async () => [[]] });
stub("../../../config/firebase", { firebaseStatus: { enabled: true, projectId: "reward-planners-2324d" }, legacyFirebaseStatus: { enabled: false }, knownProjectIds: () => new Set() });

const { TEST_CONTENT, resolveTestDevice, sendSingleDeviceTestPush } = require("../utils/singleDeviceTestPush");

const TOKEN = "fcm-token-abcdefghijklmnopqrstuvwxyz-0123456789";
const device = (id, project, platform = "android") => ({ id, fcm_token: `${TOKEN}-${id}`, platform, firebase_project_id: project, last_seen_at: "2026-10-30 16:01:20" });
const devicesQuery = (rows) => async () => [rows];
const firebase = { enabled: true, projectId: "reward-planners-2324d" };

test("exactly one active Android device on the primary project is required", async () => {
  await assert.rejects(resolveTestDevice(3, { query: devicesQuery([]), projectId: firebase.projectId }), { code: "DEVICE_NOT_UNIQUE", status: 409 });
  await assert.rejects(
    resolveTestDevice(3, { query: devicesQuery([device(1, firebase.projectId), device(2, firebase.projectId)]), projectId: firebase.projectId }),
    { code: "DEVICE_NOT_UNIQUE" },
  );
  await assert.rejects(resolveTestDevice(3, { query: devicesQuery([device(1, firebase.projectId, "ios")]), projectId: firebase.projectId }), { code: "DEVICE_NOT_ANDROID" });
  // An old-build device of unknown project is not a target, so the primary one is still unique.
  const { device: chosen, summary } = await resolveTestDevice(3, { query: devicesQuery([device(1, null), device(2, firebase.projectId)]), projectId: firebase.projectId });
  assert.equal(chosen.id, 2);
  assert.deepEqual(summary, { activeDevices: 2, primaryProjectDevices: 1, otherOrUnknownProjectDevices: 1 });
});

test("one send to that one device, inbox first, general channel, no token in the result", async () => {
  const sent = [];
  const order = [];
  const attempts = [];
  const result = await sendSingleDeviceTestPush(3, {
    firebase,
    query: devicesQuery([device(1, null), device(2, firebase.projectId)]),
    createInbox: async (payload) => { order.push("inbox"); assert.equal(payload.title, TEST_CONTENT.title); return { notificationId: 9001, created: true }; },
    send: async (message) => { order.push("send"); sent.push(message); return "projects/reward-planners-2324d/messages/0:123"; },
    recordAttempts: async (rows) => { attempts.push(...rows); },
  });
  assert.deepEqual(order, ["inbox", "send"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].token, `${TOKEN}-2`); // only the primary-project device
  assert.equal(sent[0].notification.title, "Reward Planners Test");
  assert.equal(sent[0].notification.body, "Your push notification is working! Tap to open Reward Planners.");
  assert.equal(sent[0].android.notification.channelId, "reward_planners_general");
  assert.equal(sent[0].data.android_channel_id, "reward_planners_general");
  assert.equal(sent[0].android.priority, "high");
  assert.equal(sent[0].android.notification.icon, "ic_stat_notification");
  assert.equal(sent[0].data.notification_id, "9001");
  assert.equal(sent[0].data.screen, "Notifications");
  assert.equal(result.accepted, true);
  assert.equal(result.fcmMessageId, "projects/reward-planners-2324d/messages/0:123");
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].status, "accepted");
});

test("a failed send is reported once and never retried (no duplicate risk)", async () => {
  let calls = 0;
  const attempts = [];
  const result = await sendSingleDeviceTestPush(3, {
    firebase,
    query: devicesQuery([device(2, firebase.projectId)]),
    createInbox: async () => ({ notificationId: 9002, created: true }),
    send: async () => { calls += 1; throw Object.assign(new Error("socket hang up"), { code: "app/network-error" }); },
    recordAttempts: async (rows) => { attempts.push(...rows); },
  });
  assert.equal(calls, 1);
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, "app/network-error");
  assert.equal(attempts[0].status, "failed");
});

test("nothing is created or sent when Firebase is not ready or the device is ambiguous", async () => {
  const forbidden = { createInbox: async () => assert.fail("no inbox row"), send: async () => assert.fail("no send") };
  await assert.rejects(sendSingleDeviceTestPush(3, { ...forbidden, firebase: { enabled: false, reason: "pending" } }), { code: "FIREBASE_UNAVAILABLE", status: 503 });
  await assert.rejects(sendSingleDeviceTestPush(3, { ...forbidden, firebase, query: devicesQuery([]) }), { code: "DEVICE_NOT_UNIQUE" });
});

test("with two devices, only an explicitly named primary-project device of this employee is targeted", async () => {
  const rows = [device(1703, firebase.projectId), device(1713, firebase.projectId), device(50, null)];
  await assert.rejects(resolveTestDevice(3, { query: devicesQuery(rows), projectId: firebase.projectId }), { code: "DEVICE_NOT_UNIQUE" });
  const { device: chosen } = await resolveTestDevice(3, { query: devicesQuery(rows), projectId: firebase.projectId, deviceId: "1713" });
  assert.equal(chosen.id, 1713);
  // Unknown ids, other employees' devices and non-primary devices are refused.
  await assert.rejects(resolveTestDevice(3, { query: devicesQuery(rows), projectId: firebase.projectId, deviceId: 999 }), { code: "DEVICE_NOT_FOUND", status: 404 });
  await assert.rejects(resolveTestDevice(3, { query: devicesQuery(rows), projectId: firebase.projectId, deviceId: 50 }), { code: "DEVICE_NOT_FOUND" });

  const sent = [];
  await sendSingleDeviceTestPush(3, {
    firebase, deviceId: 1713, query: devicesQuery(rows),
    createInbox: async () => ({ notificationId: 1, created: true }),
    send: async (message) => { sent.push(message.token); return "projects/p/messages/1"; },
    recordAttempts: async () => {},
  });
  assert.deepEqual(sent, [`${TOKEN}-1713`]);
});
