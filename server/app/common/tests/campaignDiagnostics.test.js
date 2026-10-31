const test = require("node:test");
const assert = require("node:assert/strict");

const { describeWorkerState, diagnoseCampaign, expiryTooClose, sendBlockers } = require("../utils/campaignDiagnostics");
const { campaignWorkerRuntime, startScheduledJobs } = require("../../../config/scheduledJobs");
const { localToUtc, toSqlUtc } = require("../utils/campaignSchedule");
const { buildPushMessage } = require("../utils/notificationPayload");

// The "Diwali Ussav" campaign as stored locally: Send Now at 16:14:14 IST,
// expiry 16:15 IST, one selected employee with no consent record.
const diwali = {
  campaign_id: 3, status: "scheduled", category: "marketing", occurrences_started: 0,
  next_run_at: new Date("2026-10-30T10:44:14Z"), scheduled_at: new Date("2026-10-30T10:44:14Z"),
  expires_at: new Date("2026-10-30T10:45:00Z"), timezone: "Asia/Kolkata",
};
const noConsent = { candidates: 1, consented: 0, noPreferenceRecord: 1, optedOut: 0, reachable: 0, unknownProjectDevices: 0 };
const ready = { candidates: 1, consented: 1, noPreferenceRecord: 0, optedOut: 0, reachable: 1, unknownProjectDevices: 0 };
const firebase = { enabled: true, projectId: "reward-planners-2324d" };

test("IST wall-clock times are stored as the matching UTC instant", () => {
  assert.equal(toSqlUtc(localToUtc("2026-10-30", "16:14", "Asia/Kolkata")), "2026-10-30 10:44:00");
  assert.equal(toSqlUtc(localToUtc("2026-10-31", "00:15", "Asia/Kolkata")), "2026-10-30 18:45:00"); // crosses midnight
});

test("send blockers: scheduler off, expiry too close, consent and devices", () => {
  const base = { category: "marketing", audience: ready, schedulerRunning: true, firebaseEnabled: true, startAt: diwali.next_run_at, expiresAt: null };
  assert.deepEqual(sendBlockers(base), []);
  assert.deepEqual(sendBlockers({ ...base, schedulerRunning: false }), ["scheduler_disabled"]);
  assert.deepEqual(sendBlockers({ ...base, expiresAt: diwali.expires_at }), ["expiry_too_close"]);
  assert.deepEqual(sendBlockers({ ...base, audience: noConsent }), ["no_consent"]);
  assert.deepEqual(sendBlockers({ ...base, audience: { ...ready, reachable: 0 } }), ["no_device"]);
  assert.deepEqual(sendBlockers({ ...base, audience: { ...ready, candidates: 0, consented: 0, reachable: 0 } }), ["no_candidates"]);
  // Transactional categories need no opt-in, only a reachable device.
  assert.deepEqual(sendBlockers({ ...base, category: "transactional", audience: { ...noConsent, consented: 1, reachable: 1 } }), []);
  assert.equal(expiryTooClose(new Date("2026-10-30T10:00:00Z"), new Date("2026-10-30T10:10:00Z")), false);
  assert.equal(expiryTooClose(new Date("2026-10-30T10:00:00Z"), null), false);
});

test("the Diwali campaign is reported as blocked, with every reason, before its expiry", () => {
  const result = diagnoseCampaign({ campaign: diwali, now: new Date("2026-10-30T10:44:30Z"), schedulerRunning: false, firebase, audience: noConsent });
  assert.equal(result.stage, "blocked");
  assert.equal(result.due, true);
  assert.deepEqual(result.blockers.map((b) => b.code), ["scheduler_disabled", "expiry_too_close", "no_consent"]);
  // Scheduled -> Due -> Worker -> Audience -> Consent -> Tokens -> Queue -> FCM -> Result
  assert.deepEqual(result.checks.map((check) => check.key), ["scheduled", "due", "worker", "audience", "consent", "tokens", "queue", "submitted", "result"]);
  const state = Object.fromEntries(result.checks.map((check) => [check.key, check.state]));
  assert.deepEqual(state, {
    scheduled: "pass", due: "pass", worker: "fail", audience: "pass", consent: "fail",
    tokens: "pending", queue: "pending", submitted: "pending", result: "pending", // never claims progress it did not make
  });
  const consent = result.checks.find((check) => check.key === "consent").detail;
  assert.equal(consent, "0 eligible · 1 excluded (1 no consent record, 0 opted out)");
});

test("after its expiry the campaign says so instead of 'queued'", () => {
  const result = diagnoseCampaign({ campaign: diwali, now: new Date("2026-10-30T11:11:00Z"), schedulerRunning: false, firebase, audience: noConsent });
  assert.ok(result.expired);
  assert.ok(result.blockers.some((b) => b.code === "campaign_expired"));
  assert.ok(!result.blockers.some((b) => b.code === "expiry_too_close"));
});

test("a healthy future campaign is simply scheduled; worker progress is reported, not invented", () => {
  const future = { ...diwali, expires_at: null, next_run_at: new Date("2026-11-01T04:30:00Z") };
  assert.equal(diagnoseCampaign({ campaign: future, now: new Date("2026-10-30T11:00:00Z"), schedulerRunning: true, firebase, audience: ready }).stage, "scheduled");

  const sending = { ...diwali, status: "sending", occurrences_started: 1, expires_at: null };
  const progress = diagnoseCampaign({ campaign: sending, schedulerRunning: true, firebase, audience: ready, summary: { recipients: 1, queued: 1 } });
  assert.equal(progress.stage, "recipients_resolved");
  const accepted = diagnoseCampaign({ campaign: { ...sending, status: "completed" }, schedulerRunning: true, firebase, audience: ready, summary: { recipients: 1, attempted: 1, firebaseAccepted: 1 } });
  assert.equal(accepted.checks.find((c) => c.key === "result").state, "pass");
  assert.match(accepted.checks.find((c) => c.key === "result").detail, /not proof/);

  const skippedAll = diagnoseCampaign({ campaign: { ...sending, status: "completed" }, schedulerRunning: true, firebase, audience: noConsent, summary: { recipients: 1, skipped: 1 } });
  assert.equal(skippedAll.stage, "no_eligible_recipients");
});

test("worker state reports what this process runs, not what the environment asks for", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  assert.deepEqual(
    [describeWorkerState({ configured: false, now }).state, describeWorkerState({ configured: false, now }).campaignWorkerEnabled],
    ["off", false],
  );
  const notStarted = describeWorkerState({ configured: true, now });
  assert.equal(notStarted.campaignWorkerEnabled, false); // flag set, but nothing started
  assert.match(notStarted.reason, /not started by this server process/);
  const runtime = { campaignWorkerStarted: true, campaignWorkerStartedAt: "2026-10-30T11:59:30Z", mode: "campaign_worker_only" };
  assert.equal(describeWorkerState({ runtime, configured: true, now }).state, "starting");
  assert.equal(describeWorkerState({ runtime, heartbeat: { lastRunAt: "2026-10-30T11:59:40Z", lastOutcome: "ok" }, configured: true, now }).campaignWorkerEnabled, true);
  assert.equal(describeWorkerState({ runtime, heartbeat: { lastRunAt: "2026-10-30T11:50:00Z", lastOutcome: "ok" }, configured: true, now }).state, "stalled");
  assert.equal(describeWorkerState({ runtime, heartbeat: { lastRunAt: "2026-10-30T11:59:40Z", lastOutcome: "error", lastError: "ER_LOCK" }, configured: true, now }).campaignWorkerEnabled, false);
  assert.equal(describeWorkerState({ runtime, heartbeat: { lastRunAt: "2026-10-30T11:59:40Z", lastOutcome: "firebase_disabled" }, configured: true, now }).state, "waiting_for_firebase");
});

test("ENABLE_LOCAL_CAMPAIGN_WORKER loads only the campaign worker and records that it started", () => {
  const loaded = [];
  startScheduledJobs({ NODE_ENV: "development", ENABLE_LOCAL_CAMPAIGN_WORKER: "true" }, (job) => loaded.push(job), { info() {} });
  assert.deepEqual(loaded, ["../services/Notifications/campaignWorkerCron"]);
  assert.equal(campaignWorkerRuntime().campaignWorkerStarted, true);
  assert.equal(campaignWorkerRuntime().mode, "campaign_worker_only");
});

test("channel and priority follow the category on Android and iOS; both channel fields agree", () => {
  const push = (metadata, extra = {}) => buildPushMessage({ title: "T", message: "M", metadata, ...extra }, "token");
  const cases = [
    [push({ category: "marketing", campaign_id: 3 }), "reward_planners_offers", "normal", "5", "passive"],
    [push({ category: "engagement" }), "reward_planners_updates", "normal", "5", "active"],
    [push({ category: "announcement" }), "reward_planners_updates", "normal", "5", "active"],
    [push(undefined, { type: "order_shipped" }), "reward_planners_general", "high", "10", "active"],
    [push(undefined, { type: "chat_message", module: "chat" }), "reward_planners_general", "high", "10", "active"],
  ];
  for (const [message, channel, androidPriority, apnsPriority, level] of cases) {
    assert.equal(message.android.notification.channelId, channel); // system-rendered (background) display
    assert.equal(message.data.android_channel_id, channel); // foreground Notifee display
    assert.equal(message.android.priority, androidPriority);
    assert.equal(message.apns.headers["apns-priority"], apnsPriority);
    assert.equal(message.apns.payload.aps["interruption-level"], level);
    assert.equal(message.apns.payload.aps["thread-id"], channel);
    assert.equal(message.notification.title, "T"); // displayable by the OS while backgrounded
  }
  // Promotions are quiet: no forced sound or vibration on any platform.
  const offer = cases[0][0];
  assert.equal(offer.android.notification.sound, undefined);
  assert.equal(offer.android.notification.vibrateTimingsMillis, undefined);
  assert.equal(offer.apns.payload.aps.sound, undefined);
  assert.equal(cases[3][0].apns.payload.aps.sound, "default");
  // Every data value stays a string (FCM requirement).
  assert.ok(Object.values(offer.data).every((value) => typeof value === "string"));
});

test("system notifications name the packaged Android icon, never a path or URL; routing metadata survives", () => {
  const message = buildPushMessage({
    title: "Diwali", message: "Offers", screen: "Notifications", notification_id: 77,
    metadata: { category: "marketing", campaign_id: 3 },
  }, "token");
  assert.equal(message.android.notification.icon, "ic_stat_notification");
  assert.doesNotMatch(JSON.stringify(message), /[A-Za-z]:\\|file:|\.png|RewardsPlanners/);
  assert.equal(message.data.notification_id, "77");
  assert.equal(message.data.campaign_id, "3");
  assert.ok(message.data.target_route);
});
