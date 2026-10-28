const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const sharp = require("sharp");

// No MySQL in unit tests: a scripted fake pool records every query.
let dbHandler = async () => [[]];
const queries = [];
const fakeDb = {
  query: async (sql, params) => { queries.push({ sql, params }); return dbHandler(sql, params); },
  execute: async (sql, params) => { queries.push({ sql, params }); return dbHandler(sql, params); },
};
const dbPath = require.resolve(path.join(__dirname, "../../../config/database"));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const { evaluateDeliveryPolicy, notificationCategory } = require("../utils/notificationPolicy");
const { deliverNotification } = require("../utils/notification");
const { canSendNotifications, validateAnnouncement, validateCampaignInput } = require("../utils/campaignRules");
const { classifyFcmError, selectDeliveryTokens } = require("../utils/pushDelivery");
const { buildPushMessage } = require("../utils/notificationPayload");
const { checkImageAvailable, normalizeNotificationImage } = require("../utils/notificationImage");
const { dayRangeUtc, minutesInZone, startOfDayUtc, utcOffsetString } = require("../utils/campaignSchedule");
const { DESTINATIONS, resolveDestination } = require("../utils/notificationDestinations");
const { processRecipient } = require("../../../services/Notifications/campaignWorker");

const noon = new Date("2026-11-02T06:30:00Z"); // 12:00 IST
const model = (preferences, sentToday = 0) => ({
  getPreferences: async () => preferences,
  countCategoryToday: async () => sentToday,
});

/* 1 + 3. Consent for promotional events, centrally */

test("automatic nudges are promotional; everything else is transactional", () => {
  assert.equal(notificationCategory({ type: "cart_abandonment" }), "marketing");
  assert.equal(notificationCategory({ type: "fitness_midday_hook" }), "engagement");
  assert.equal(notificationCategory({ type: "coworker_birthday" }), "engagement");
  for (const type of ["order_paid", "bbps_payment_success", "password_reset", "refund_completed", "todo_reminder", "chat_message", "bbps_bill_due"]) {
    assert.equal(notificationCategory({ type }), "transactional", type);
  }
  assert.equal(notificationCategory({ type: "campaign_marketing", metadata: { category: "announcement" } }), "announcement");
});

test("a missing preference row never implies promotional opt-in", async () => {
  const missing = { missing: true, marketing_enabled: 0, engagement_enabled: 0 };
  assert.equal((await evaluateDeliveryPolicy({ userId: 1, type: "cart_abandonment" }, { now: noon, model: model(missing) })).reason, "no_consent_record");
  assert.equal((await evaluateDeliveryPolicy({ userId: 1, type: "fitness_midday_hook" }, { now: noon, model: model(null) })).reason, "preferences_unavailable");
  assert.equal((await evaluateDeliveryPolicy({ userId: 1, type: "order_paid" }, { now: noon, model: model(missing) })).allowed, true);
});

test("opted-in employees get nudges within quiet hours and the daily limit", async () => {
  const optedIn = { marketing_enabled: 1, engagement_enabled: 1 };
  assert.equal((await evaluateDeliveryPolicy({ userId: 1, type: "cart_low_stock" }, { now: noon, model: model(optedIn, 1) })).allowed, true);
  assert.equal((await evaluateDeliveryPolicy({ userId: 1, type: "cart_low_stock" }, { now: noon, model: model(optedIn, 2) })).reason, "daily_cap_reached");
  const quiet = await evaluateDeliveryPolicy({ userId: 1, type: "cart_low_stock" }, { now: noon, model: model({ ...optedIn, quiet_hours_start: "11:00:00", quiet_hours_end: "13:00:00" }) });
  assert.equal(quiet.reason, "quiet_hours");
  assert.equal(quiet.resumeAt.toISOString(), "2026-11-02T07:30:00.000Z");
});

test("deliverNotification stores nothing and pushes nothing for a declined nudge", async () => {
  queries.length = 0;
  dbHandler = async (sql) => {
    if (/FROM notification_preferences/.test(sql)) return [[]]; // no row -> no consent
    return [[]];
  };
  const result = await deliverNotification({ userId: 7, module: "ecommerce", type: "cart_abandonment", title: "t", message: "m" });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "no_consent_record");
  assert.equal(queries.some(({ sql }) => /INSERT INTO notifications/.test(sql)), false);
  dbHandler = async () => [[]];
});

/* 2. Announcements cannot be used to bypass consent */

const announcement = (overrides = {}) => ({
  name: "Office closed", module: "common", category: "announcement", announcement_type: "event",
  title_en: "Office closed on Friday", body_en: "The office is closed for Diwali.", ...overrides,
});

test("announcements need an allowed type and the common module", () => {
  assert.deepEqual(validateCampaignInput(announcement()).errors, []);
  assert.ok(validateCampaignInput(announcement({ announcement_type: "" })).errors.some((e) => /announcement type/.test(e)));
  assert.ok(validateCampaignInput(announcement({ module: "ecommerce" })).errors.some((e) => /Common/.test(e)));
  assert.ok(validateCampaignInput(announcement({ destination_type: "cart" })).errors.length > 0);
});

test("promotional wording cannot be sent as an announcement", () => {
  for (const body of ["Flat 50% off this weekend", "Big sale on electronics", "Use coupon RP10", "Now only ₹499", "Shop now!"]) {
    assert.ok(validateAnnouncement({ ...announcement(), body_en: body }).some((e) => /promotion/.test(e)), body);
  }
  assert.ok(validateCampaignInput(announcement({ category: "marketing", body_en: "Flat 50% off" })).errors.length === 0, "fine as marketing");
});

test("announcements respect quiet hours and their own daily limit (no consent needed)", async () => {
  const payload = { userId: 1, type: "campaign_announcement", metadata: { category: "announcement" } };
  assert.equal((await evaluateDeliveryPolicy(payload, { now: noon, model: model({ missing: true }, 0) })).allowed, true);
  assert.equal((await evaluateDeliveryPolicy(payload, { now: noon, model: model({ missing: true }, 2) })).reason, "daily_cap_reached");
  assert.equal((await evaluateDeliveryPolicy(payload, { now: noon, model: model({ quiet_hours_start: "11:00", quiet_hours_end: "13:00" }, 0) })).reason, "quiet_hours");
});

/* 4 + 5. Worker retries and statuses */

const campaign = {
  campaign_id: 7, status: "sending", category: "marketing", module: "ecommerce", priority: "normal",
  title_en: "Deals", body_en: "Hi {{first_name}}", approved_languages: "", variables: {}, expires_at: null,
};
const retry = { recipient_id: 1, campaign_id: 7, occurrence_no: 1, user_id: 42, language: "en", attempts: 1, notification_id: 900, customer_name: "Asha" };

test("a retry re-checks opt-out and quiet hours", async () => {
  const never = async () => { throw new Error("must not send"); };
  assert.equal((await processRecipient(retry, campaign, { marketing_enabled: 0 }, noon, { deliver: never, countToday: async () => 0 })).skip_reason, "opted_out");
  const deferred = await processRecipient(retry, campaign, { marketing_enabled: 1, quiet_hours_start: "11:00", quiet_hours_end: "13:00" }, noon, { deliver: never, countToday: async () => 0 });
  assert.equal(deferred.status, "pending");
  assert.equal(deferred.skip_reason, "deferred_quiet_hours");
});

test("a retry excludes its own inbox row from the daily limit", async () => {
  let excluded;
  const update = await processRecipient(retry, campaign, { marketing_enabled: 1 }, noon, {
    countToday: async (_user, _categories, exclude) => { excluded = exclude; return 1; },
    deliver: async () => ({ success: true, sent: 1, notificationId: 900, results: [{ success: true }] }),
  });
  assert.equal(excluded, 900);
  assert.equal(update.status, "sent");
});

test("no device -> inbox_only; accepted after a crash -> not pushed again", async () => {
  const announcementCampaign = { ...campaign, category: "announcement", announcement_type: "event" };
  const inboxOnly = await processRecipient({ ...retry, attempts: 0, notification_id: null }, announcementCampaign, undefined, noon, {
    countToday: async () => 0, deliver: async () => ({ success: false, skipped: true, reason: "missing_fcm_token", notificationId: 901 }),
  });
  assert.equal(inboxOnly.status, "inbox_only");
  assert.equal(inboxOnly.devices_accepted, 0);

  dbHandler = async (sql) => {
    if (/INSERT INTO notifications/.test(sql)) return [{ insertId: 905, affectedRows: 2 }]; // duplicate key: row already exists
    if (/notification_push_attempts/.test(sql)) return [[{ total: 1 }]];
    return [[]];
  };
  const resumed = await deliverNotification({ userId: 42, module: "common", type: "campaign_announcement", title: "t", message: "m", idempotency_key: "campaign:7:1:42" }, { pushIfDuplicate: true, policy: "checked" });
  assert.equal(resumed.alreadyAccepted, true);
  assert.equal(resumed.sent, 1);
  dbHandler = async () => [[]];
});

/* 6. Sending authority */

test("RMs and admins can send; RM sending can be switched off", () => {
  assert.equal(canSendNotifications({ role: "rm" }), true);
  assert.equal(canSendNotifications({ role: "admin" }), true);
  assert.equal(canSendNotifications({ role: "hr" }), false);
  process.env.NOTIFICATION_RM_SEND_ENABLED = "false";
  try {
    assert.equal(canSendNotifications({ role: "rm" }), false);
    assert.equal(canSendNotifications({ role: "admin" }), true);
  } finally {
    delete process.env.NOTIFICATION_RM_SEND_ENABLED;
  }
});

/* 8. Real mobile routes */

test("destinations use the app's real nested navigator paths", () => {
  const byKey = Object.fromEntries(DESTINATIONS.map((item) => [item.key, item]));
  assert.equal(byKey.notifications.route.path.join(">"), "App>Notification");
  assert.equal(byKey.ecommerce_home.route.path.join(">"), "App>Home>ProductModule>Home");
  assert.equal(byKey.bus_search.route.path.join(">"), "App>Home>DineOutModule>BookingHomeScreen");
  assert.equal(byKey.service.route.path.join(">"), "App>Home>ServicesModule>ServiceDescription");
  assert.equal(byKey.fitness_dashboard.route.path.join(">"), "App>RewardStack>Dashboard");
  assert.equal(byKey.product_collection.mobileRoute, "not_in_app");
  const service = resolveDestination({ module: "service", destinationType: "service", destinationId: "5" });
  assert.deepEqual(service.target_route.params, { serviceId: 5 });
});

test("system notifications get a real route from their existing screen name", () => {
  const message = buildPushMessage({ title: "t", message: "m", screen: "EcommerceHome" }, "token");
  assert.equal(message.data.screen, "EcommerceHome", "old builds keep the same key");
  assert.deepEqual(JSON.parse(message.data.target_route).path, ["App", "Home", "ProductModule", "Home"]);
  assert.deepEqual(JSON.parse(buildPushMessage({ title: "t", message: "m", screen: "Notifications" }, "x").data.target_route).path, ["App", "Notification"]);
});

/* 10. Image size limit */

test("the compressed-size limit is enforced, never exceeded", async () => {
  const noise = await sharp(Buffer.from(Array.from({ length: 1200 * 600 * 3 }, () => Math.floor(Math.random() * 256))), { raw: { width: 1200, height: 600, channels: 3 } }).png().toBuffer();
  // A limit the image cannot meet even at the lowest quality is refused...
  await assert.rejects(normalizeNotificationImage(noise, { maxOutputBytes: 20 * 1024 }), /too detailed to compress under 20 KB/);
  // ...and whatever is accepted is within the stored limit.
  const stored = await normalizeNotificationImage(noise);
  assert.ok(stored.bytes <= 300 * 1024, `${stored.bytes} bytes`);
});

test("send-time image checks measure size when the CDN omits it, and only allow library paths", async () => {
  const head = (headers) => ({ ok: true, status: 200, headers: { get: (name) => headers[name.toLowerCase()] ?? null } });
  const body = (bytes) => ({ ...head({ "content-type": "image/jpeg" }), body: { getReader() { let sent = false; return { read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: Buffer.alloc(bytes) })), cancel: async () => {} }; } } });
  const url = "https://cdn.rewardplanners.com/public/notifications/2026/10/a.jpg";
  const big = await checkImageAvailable(url, { fetchImpl: async (_u, init) => (init.method === "HEAD" ? head({ "content-type": "image/jpeg" }) : body(400 * 1024)) });
  assert.equal(big.ok, false);
  const small = await checkImageAvailable(url, { fetchImpl: async (_u, init) => (init.method === "HEAD" ? head({ "content-type": "image/jpeg" }) : body(50 * 1024)) });
  assert.deepEqual(small, { ok: true, bytes: 50 * 1024 });
  assert.equal((await checkImageAvailable("https://cdn.rewardplanners.com/public/products/1/a.jpg")).reason, "Not a notification library image");
});

/* 11. Firebase project routing */

test("sender-project mismatch is detected from errorInfo too, and tokens are kept", () => {
  const error = Object.assign(new Error("Requested entity was not found."), { code: "messaging/mismatched-credential", errorInfo: { message: "SenderId mismatch" } });
  assert.equal(classifyFcmError(error), "project_mismatch");
  const [target] = selectDeliveryTokens({ deviceRows: [{ id: 3, fcm_token: "t", platform: "android", firebase_project_id: "rewardplanners-ebbe4" }] });
  assert.equal(target.firebaseProjectId, "rewardplanners-ebbe4", "known project is used to route the next send");
});

/* 12. Timezones */

test("employee day, quiet-hour clock and filters use Asia/Kolkata explicitly", () => {
  const lateEvening = new Date("2026-10-28T20:00:00Z"); // 01:30 IST on the 29th
  assert.equal(startOfDayUtc(lateEvening, "Asia/Kolkata").toISOString(), "2026-10-28T18:30:00.000Z");
  assert.equal(minutesInZone(lateEvening, "Asia/Kolkata"), 90);
  assert.equal(utcOffsetString("Asia/Kolkata", lateEvening), "+05:30");
  assert.deepEqual(dayRangeUtc("2026-10-01", "2026-10-31", "Asia/Kolkata"), { fromUtc: "2026-09-30 18:30:00", toUtc: "2026-10-31 18:30:00" });
  assert.deepEqual(dayRangeUtc("bad", null, "Asia/Kolkata"), { fromUtc: null, toUtc: null });
});
