const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// Never touch MySQL from unit tests: replace the shared pool before any
// model is loaded. Queries are recorded so tests can assert on them.
const queries = [];
const fakeDb = {
  query: async (sql, params) => { queries.push({ sql, params }); return [[]]; },
  execute: async (sql, params) => { queries.push({ sql, params }); return [[]]; },
};
const dbPath = require.resolve(path.join(__dirname, "../../../config/database"));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const catalog = require("../../../data/notification-templates-v1.json");
const { localToUtc, nextOccurrence, toSqlUtc, fromSqlUtc } = require("../utils/campaignSchedule");
const {
  campaignCategoryForTemplate,
  carryApprovedLanguages,
  checkAudiencePermission,
  renderCampaignForRecipient,
  validateCampaignInput,
  validateForSubmission,
} = require("../utils/campaignRules");
const {
  approvedLanguagesFor,
  checkPromotionalEligibility,
  minutesUntilQuietHoursEnd,
  normalizePreferenceUpdate,
} = require("../utils/notificationTemplate");
const AudienceModel = require("../models/notificationAudienceModel");
const { processRecipient, upcomingRun, buildCampaignPayload } = require("../../../services/Notifications/campaignWorker");

const byKey = Object.fromEntries(catalog.templates.map((t) => [t.template_key, t]));
const manual = (overrides = {}) => ({
  name: "Weekend offers",
  module: "ecommerce",
  category: "marketing",
  title_en: "Weekend offers are here!",
  body_en: "Explore special offers on Reward Planners.",
  ...overrides,
});

/* ---------- scheduling (Asia/Kolkata, UTC storage) ---------- */

test("Asia/Kolkata wall-clock times are stored as UTC", () => {
  assert.equal(localToUtc("2026-11-01", "09:00", "Asia/Kolkata").toISOString(), "2026-11-01T03:30:00.000Z");
  assert.equal(localToUtc("2026-11-01", "02:00", "Asia/Kolkata").toISOString(), "2026-10-31T20:30:00.000Z");
  assert.equal(toSqlUtc(new Date("2026-11-01T03:30:00Z")), "2026-11-01 03:30:00");
  assert.equal(fromSqlUtc("2026-11-01 03:30:00").toISOString(), "2026-11-01T03:30:00.000Z");
  assert.equal(localToUtc("2026-02-30", "09:00", "Asia/Kolkata"), null);
  assert.equal(localToUtc("2026-11-01", "25:00", "Asia/Kolkata"), null);
});

test("recurring runs keep the local time; monthly clamps to short months", () => {
  const first = localToUtc("2027-01-31", "09:00", "Asia/Kolkata");
  assert.equal(nextOccurrence(first, "daily", "Asia/Kolkata").toISOString(), "2027-02-01T03:30:00.000Z");
  assert.equal(nextOccurrence(first, "weekly", "Asia/Kolkata").toISOString(), "2027-02-07T03:30:00.000Z");
  const feb = nextOccurrence(first, "monthly", "Asia/Kolkata", 31);
  assert.equal(feb.toISOString(), "2027-02-28T03:30:00.000Z");
  assert.equal(nextOccurrence(feb, "monthly", "Asia/Kolkata", 31).toISOString(), "2027-03-31T03:30:00.000Z");
  assert.equal(nextOccurrence(first, "none", "Asia/Kolkata"), null);
});

test("occurrences missed during downtime are skipped, not replayed", () => {
  const campaign = { recurrence_type: "daily", timezone: "Asia/Kolkata", scheduled_at: localToUtc("2026-10-01", "09:00", "Asia/Kolkata") };
  const now = new Date("2026-10-20T06:00:00Z"); // 11:30 IST on the 20th
  assert.equal(upcomingRun(campaign, campaign.scheduled_at, 1, now).toISOString(), "2026-10-21T03:30:00.000Z");
  assert.equal(upcomingRun({ ...campaign, max_occurrences: 1 }, campaign.scheduled_at, 1, now), null);
  assert.equal(upcomingRun({ ...campaign, recurrence_end_at: new Date("2026-10-20T18:29:00Z") }, campaign.scheduled_at, 1, now), null);
});

/* ---------- composer validation ---------- */

test("a manual notification validates; audience defaults to test only", () => {
  const { value, errors } = validateCampaignInput(manual());
  assert.deepEqual(errors, []);
  assert.equal(value.audience_type, "test");
  assert.equal(value.module, "ecommerce");
  assert.equal(value.source, "manual");
});

test("required fields, translation pairs and screens are enforced", () => {
  const { errors } = validateCampaignInput({ title_hi: "शीर्षक" });
  assert.ok(errors.some((e) => /name is required/.test(e)));
  assert.ok(errors.some((e) => /valid module/.test(e)));
  assert.ok(errors.some((e) => /category/.test(e)));
  assert.ok(errors.some((e) => /English title and message/.test(e)));
  assert.ok(errors.some((e) => /Hindi needs both/.test(e)));

  assert.ok(validateCampaignInput(manual({ target_screen: "rp://anything" })).errors.some((e) => /not an available app screen/.test(e)));
  assert.ok(validateCampaignInput(manual({ target_screen: "OrderDetails" })).errors.some((e) => /needs a reference ID/.test(e)));
  assert.ok(validateCampaignInput(manual({ image_url: "http://cdn.rewardplanners.com/a.png" })).errors.some((e) => /https/.test(e)));
});

test("Support maps to the existing common module, not a new identifier", () => {
  const { value } = validateCampaignInput(manual({ module: "support" }));
  assert.equal(value.module, "common");
  assert.equal(value.target_screen, "Support");
});

test("schedule inputs are converted from the chosen timezone", () => {
  const { value } = validateCampaignInput(manual({ delivery_mode: "once", send_date: "2026-12-01", send_time: "18:00", timezone: "Asia/Kolkata" }));
  assert.equal(value.scheduled_at.toISOString(), "2026-12-01T12:30:00.000Z");
});

test("submission rejects past times, test-only audiences and missing placeholders", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const base = { ...validateCampaignInput(manual({ audience_type: "company", audience_filter: { company_ids: [1] } })).value, variables: {} };
  assert.ok(validateForSubmission({ ...base, delivery_mode: "once", scheduled_at: new Date("2026-10-01T00:00:00Z") }, now).some((e) => /past/.test(e)));
  assert.ok(validateForSubmission({ ...base, delivery_mode: "now", audience_type: "test" }, now).some((e) => /Test-only/.test(e)));
  assert.ok(validateForSubmission({ ...base, delivery_mode: "now", body_en: "Code {{coupon}}" }, now).some((e) => /coupon/.test(e)));
  assert.deepEqual(validateForSubmission({ ...base, delivery_mode: "now", body_en: "Hi {{first_name}}" }, now), []);
});

/* ---------- templates ---------- */

test("only promotional templates and announcements may become campaigns", () => {
  assert.equal(campaignCategoryForTemplate(byKey.order_confirmed), null);
  assert.equal(campaignCategoryForTemplate({ template_key: "password_reset", notification_type: "transactional" }), null);
  assert.equal(campaignCategoryForTemplate(byKey.flash_sale), "marketing");
  assert.equal(campaignCategoryForTemplate(byKey.daily_quiz), "engagement");
  assert.equal(campaignCategoryForTemplate(byKey.hr_announcement), "announcement");
});

test("per-language approval statuses are parsed", () => {
  assert.deepEqual([...approvedLanguagesFor({ localization_status: "approved:hi" })], ["hi"]);
  assert.deepEqual([...approvedLanguagesFor({ localization_status: "approved:" })], []);
  assert.deepEqual([...approvedLanguagesFor({ localization_status: "en_mr_hi_draft" })], []);
  assert.deepEqual([...approvedLanguagesFor({ approved_languages: "hi,mr" })].sort(), ["hi", "mr"]);
});

test("editing an approved translation withdraws its approval", () => {
  const previous = { approved_languages: "hi,mr", title_hi: "A", body_hi: "B", title_mr: "C", body_mr: "D" };
  const next = { title_hi: "A", body_hi: "B changed", title_mr: "C", body_mr: "D" };
  assert.equal(carryApprovedLanguages(previous, next, [], false), "mr");
  // Only admins can add approvals.
  assert.equal(carryApprovedLanguages(previous, next, ["hi"], false), "mr");
  assert.equal(carryApprovedLanguages(previous, next, ["hi"], true), "hi,mr");
});

/* ---------- language rendering ---------- */

const weekend = {
  title_en: "Weekend offers are here!", body_en: "Explore special offers, {{first_name}}.",
  title_hi: "वीकेंड ऑफ़र आ गए हैं!", body_hi: "Reward Planners पर खास ऑफ़र देखें।",
  title_mr: "वीकेंड ऑफर्स आले आहेत!", body_mr: "Reward Planners वरील खास ऑफर्स पाहा.",
  approved_languages: "hi,mr", variables: {},
};

test("each employee receives their own approved language from one campaign", () => {
  assert.equal(renderCampaignForRecipient(weekend, { language: "en", firstName: "A" }).title, "Weekend offers are here!");
  assert.equal(renderCampaignForRecipient(weekend, { language: "hi", firstName: "B" }).title, "वीकेंड ऑफ़र आ गए हैं!");
  assert.equal(renderCampaignForRecipient(weekend, { language: "mr", firstName: "C" }).title, "वीकेंड ऑफर्स आले आहेत!");
  assert.equal(renderCampaignForRecipient(weekend, { language: "en", firstName: "Asha" }).message, "Explore special offers, Asha.");
});

test("unapproved or missing translations fall back to English", () => {
  const draft = { ...weekend, approved_languages: "hi" };
  assert.equal(renderCampaignForRecipient(draft, { language: "mr" }).language, "en");
  const noMarathi = { ...weekend, title_mr: null, body_mr: null };
  assert.equal(renderCampaignForRecipient(noMarathi, { language: "mr" }).language, "en");
});

/* ---------- RM scope & audiences ---------- */

const rmNone = { global: false, companyIds: [], assignmentsAvailable: false };
const rmAssigned = { global: false, companyIds: [10, 11], assignmentsAvailable: true };
const admin = { global: true, companyIds: [], assignmentsAvailable: true };

test("RMs are limited to their assigned companies", () => {
  assert.equal(checkAudiencePermission("company", { company_ids: [10] }, rmAssigned).allowed, true);
  assert.equal(checkAudiencePermission("company", { company_ids: [10, 99] }, rmAssigned).allowed, false);
  assert.equal(checkAudiencePermission("assigned_companies", {}, rmAssigned).allowed, true);
  assert.match(checkAudiencePermission("company", { company_ids: [10] }, rmNone).reason, /not configured/);
});

test("global broadcasts need an admin", () => {
  assert.equal(checkAudiencePermission("all_companies", {}, rmAssigned).allowed, false);
  assert.equal(checkAudiencePermission("all_companies", {}, admin).allowed, true);
});

test("audience SQL always applies scope, even for a forged filter", () => {
  const scoped = AudienceModel.audienceWhere("selected", { user_ids: [1, 2] }, rmAssigned);
  assert.match(scoped.sql, /c\.company_id IN \(\?,\?\)/);
  assert.deepEqual(scoped.params, [10, 11, 1, 2]);
  assert.match(AudienceModel.audienceWhere("all_companies", {}, rmAssigned).sql, /1 = 0/);
  assert.match(AudienceModel.audienceWhere("company", { company_ids: [10] }, rmNone).sql, /1 = 0/);
});

test("test-only sending can never reach real employees", () => {
  const original = process.env.NOTIFICATION_TEST_USER_IDS;
  try {
    delete process.env.NOTIFICATION_TEST_USER_IDS;
    assert.match(AudienceModel.audienceWhere("test", {}, admin).sql, /1 = 0/);
    process.env.NOTIFICATION_TEST_USER_IDS = "501, 502,abc";
    const where = AudienceModel.audienceWhere("test", { company_ids: [10], user_ids: [9] }, admin);
    assert.deepEqual(where.params, [501, 502]);
    assert.doesNotMatch(where.sql, /company_id/);
  } finally {
    if (original === undefined) delete process.env.NOTIFICATION_TEST_USER_IDS;
    else process.env.NOTIFICATION_TEST_USER_IDS = original;
  }
});

/* ---------- consent & preferences ---------- */

test("a missing preference record is not marketing consent", () => {
  assert.equal(checkPromotionalEligibility({ category: "marketing", preferences: { missing: true } }).reason, "no_consent_record");
  assert.equal(checkPromotionalEligibility({ category: "announcement", preferences: { missing: true } }).allowed, true);
});

test("mobile language updates are validated and never imply consent", () => {
  assert.deepEqual(normalizePreferenceUpdate({ language: "mr" }), { update: { language: "mr" }, errors: [] });
  assert.ok(normalizePreferenceUpdate({ language: "fr" }).errors.length);
  assert.ok(normalizePreferenceUpdate({ quiet_hours_start: "22:00" }).errors.some((e) => /together/.test(e)));
  assert.deepEqual(normalizePreferenceUpdate({ marketing_enabled: true }).update, { marketing_enabled: 1 });
  assert.ok(normalizePreferenceUpdate({ user_id: 5 }).errors.length, "user id cannot be supplied");
  assert.equal(minutesUntilQuietHoursEnd("22:00", "07:00", 23 * 60), 8 * 60);
});

/* ---------- worker decisions ---------- */

const campaign = {
  campaign_id: 7, status: "sending", category: "marketing", module: "ecommerce", priority: "normal",
  ...weekend, target_screen: null, reference_type: null, reference_id: null, image_url: null, expires_at: null,
};
const recipient = { recipient_id: 1, campaign_id: 7, occurrence_no: 2, user_id: 42, language: "en", attempts: 0, notification_id: null, customer_name: "Asha Patil" };
const optedIn = { language: "hi", marketing_enabled: 1, engagement_enabled: 1 };
const noon = new Date("2026-11-02T06:30:00Z"); // 12:00 IST
const accepted = async () => ({ success: true, sent: 1, notificationId: 900, results: [{ success: true }] });

test("worker sends in the employee's language with a stable idempotency key", async () => {
  let payload;
  const update = await processRecipient(recipient, campaign, optedIn, noon, {
    deliver: async (data, options) => { payload = { data, options }; return accepted(); },
    countPromotional: async () => 0,
  });
  assert.equal(update.status, "sent");
  assert.equal(update.language, "hi");
  assert.equal(update.devices_accepted, 1);
  assert.equal(payload.data.idempotency_key, "campaign:7:2:42");
  assert.equal(payload.options.pushIfDuplicate, true);
  assert.equal(payload.data.metadata.source, "campaign");
});

test("worker enforces opt-outs, missing consent and daily caps", async () => {
  const never = async () => { throw new Error("must not send"); };
  assert.equal((await processRecipient(recipient, campaign, { ...optedIn, marketing_enabled: 0 }, noon, { deliver: never, countPromotional: async () => 0 })).skip_reason, "opted_out");
  assert.equal((await processRecipient(recipient, campaign, undefined, noon, { deliver: never })).skip_reason, "no_consent_record");
  assert.equal((await processRecipient(recipient, campaign, optedIn, noon, { deliver: never, countPromotional: async () => 2 })).skip_reason, "daily_cap_reached");
});

test("quiet hours defer delivery until they end", async () => {
  const prefs = { ...optedIn, quiet_hours_start: "11:00:00", quiet_hours_end: "13:00:00" };
  const update = await processRecipient(recipient, campaign, prefs, noon, { deliver: async () => { throw new Error("must not send"); }, countPromotional: async () => 0 });
  assert.equal(update.status, "pending");
  assert.equal(update.next_attempt_at.toISOString(), "2026-11-02T07:30:00.000Z");
});

test("transient Firebase failures retry with backoff, then fail", async () => {
  const transient = async () => ({ success: false, sent: 0, notificationId: 900, results: [{ success: false, classification: "transient", errorCode: "messaging/internal-error" }] });
  const first = await processRecipient(recipient, campaign, optedIn, noon, { deliver: transient, countPromotional: async () => 0 });
  assert.equal(first.status, "pending");
  assert.equal(first.attempts, 1);
  assert.equal(first.notification_id, 900);

  // The retry skips eligibility (its own inbox row would count towards the cap).
  const last = await processRecipient({ ...recipient, attempts: 2, notification_id: 900 }, campaign, optedIn, noon, {
    deliver: transient, countPromotional: async () => 99,
  });
  assert.equal(last.status, "failed");
  assert.equal(last.last_error_code, "messaging/internal-error");
});

test("cancelled campaigns stop unsent recipients", async () => {
  const update = await processRecipient(recipient, { ...campaign, status: "cancelled" }, optedIn, noon, { deliver: async () => { throw new Error("must not send"); } });
  assert.equal(update.status, "cancelled");
});

test("employees without a device still get the inbox entry", async () => {
  const update = await processRecipient(recipient, { ...campaign, category: "announcement" }, undefined, noon, {
    deliver: async () => ({ success: false, skipped: true, reason: "missing_fcm_token", notificationId: 901 }),
  });
  assert.equal(update.status, "sent");
  assert.equal(update.skip_reason, "no_active_device");
});

test("campaign payloads never carry rp:// links or arbitrary URLs", () => {
  const payload = buildCampaignPayload({ ...campaign, target_screen: "Wallet" }, recipient, { title: "t", message: "m", language: "en" });
  assert.equal(payload.screen, "Wallet");
  assert.equal(payload.action_url, undefined);
});
