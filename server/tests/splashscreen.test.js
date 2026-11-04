const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const sharp = require("sharp");
// The rules are tested with fake models; never open a real database pool here.
const dbPath = require.resolve(path.join(__dirname, "../config/database"));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => { throw new Error("no database in unit tests"); } } };
const { displaySettings, isValidPageSlot, pagesForApi } = require("../utils/splashRegistry");
const {
  artworkUrl, checkArtwork, parseInstant, resolveSplash, safeLink, toIso,
  validateDefault, validatePlacement, validatePlacementPatch,
} = require("../services/splashscreenService");

const CDN = "public/content-zone-entries/9/splash.jpg";
const image = (width, height, format = "jpeg") => sharp({ create: { width, height, channels: 3, background: "#852baf" } })[format]().toBuffer();
const entry = (overrides = {}) => ({
  content_id: 9, content_type: "image", title: "Diwali Sale", cta_text: "Shop now", display_mode: "single",
  image_path: CDN, is_published: 1, priority: 0, start_utc: "2026-11-01 00:00:00", end_utc: null,
  content_status: "active", target_type: "product", target_id: 1125, target_ids: null, redirect_link: null, ...overrides,
});
const fakeModel = (overrides = {}) => ({
  serverTimeUtc: async () => "2026-11-05 06:30:00",
  liveCandidates: async () => [],
  nextStartUtc: async () => null,
  findDefault: async () => null,
  getEntry: async () => null,
  ...overrides,
});
const resolve = (model, args = {}) => resolveSplash({ pageKey: "app_launch", slotKey: "promo_splash", platform: "android", audience: "guest", ...args }, { model });

/* ---------- registry ---------- */

test("only registered page/slot pairs are accepted", () => {
  assert.equal(isValidPageSlot("app_launch", "promo_splash"), true);
  assert.equal(isValidPageSlot("dashboard", "entry_popup"), true);
  assert.equal(isValidPageSlot("payments", "entry_popup"), false, "payments has a hero banner only");
  assert.equal(isValidPageSlot("checkout", "hero_banner"), false);
  assert.equal(isValidPageSlot("toString", "hero_banner"), false, "object prototype keys are not pages");
  const pages = pagesForApi();
  assert.equal(pages.pages.length, 10);
  assert.deepEqual(pages.display_seconds, { default: 3, min: 1, max: 10 });
});

test("overlays default to 3 seconds once a day; banners never time out", () => {
  assert.deepEqual(displaySettings("promo_splash"), { frequency_rule: "once_per_day", display_seconds: 3, auto_dismiss: true, dismissible: true });
  assert.deepEqual(displaySettings("entry_popup", { frequencyRule: "every_visit", displaySeconds: 6 }).display_seconds, 6);
  assert.deepEqual(displaySettings("inline_banner", { frequencyRule: "once_per_day", displaySeconds: 5 }), { frequency_rule: "every_visit", display_seconds: null, auto_dismiss: false, dismissible: false });
});

/* ---------- time, media, links ---------- */

test("admin times must carry a zone and are stored as UTC", () => {
  assert.equal(parseInstant("2026-11-10T09:00:00+05:30"), "2026-11-10 03:30:00");
  assert.equal(parseInstant("2026-11-10T03:30:00Z"), "2026-11-10 03:30:00");
  assert.throws(() => parseInstant("2026-11-10 09:00:00"), /with a zone/);
  assert.throws(() => parseInstant("2026-02-30T09:00:00+05:30"), /not a valid time|with a zone/);
  assert.equal(toIso("2026-11-10 03:30:00"), "2026-11-10T03:30:00.000Z");
  assert.equal(toIso(null), null);
});

test("artwork is only served from the CDN over HTTPS; links only to our own HTTPS hosts", () => {
  assert.equal(artworkUrl(entry()), `https://cdn.rewardplanners.com/${CDN}`);
  assert.equal(artworkUrl(entry({ image_path: "content/legacy.jpg" })), null, "legacy local uploads are not served to the app");
  assert.equal(artworkUrl(entry({ image_path: "https://evil.example.com/x.jpg" })), null);
  assert.equal(artworkUrl(entry({ image_path: null })), null);
  assert.equal(safeLink("https://rewardplanners.com/offers"), "https://rewardplanners.com/offers");
  assert.equal(safeLink("https://shop.rewardplanners.com/a"), "https://shop.rewardplanners.com/a");
  for (const bad of ["http://rewardplanners.com", "https://rewardplanners.com.evil.io", "javascript:alert(1)", "https://user:pw@rewardplanners.com", "nope"]) {
    assert.equal(safeLink(bad), null, bad);
  }
});

test("artwork is checked by its real bytes: format, animation and size", async () => {
  const ok = await checkArtwork(entry(), { fetchImage: async () => image(1080, 1920) });
  assert.deepEqual({ format: ok.format, width: ok.width, height: ok.height }, { format: "jpeg", width: 1080, height: 1920 });
  await assert.rejects(checkArtwork(entry(), { fetchImage: async () => image(400, 800) }), /at least 600×300/);
  await assert.rejects(checkArtwork(entry(), { fetchImage: async () => Buffer.from("<html>") }), /not a readable image/);
  await assert.rejects(checkArtwork(entry(), { fetchImage: async () => { throw new Error("HTTP 404"); } }), /could not be loaded: HTTP 404/);
  await assert.rejects(checkArtwork(entry({ image_path: null }), {}), /no image on the Reward Planners CDN/);
});

/* ---------- placement and default validation ---------- */

test("a placement needs a registered page/slot and image content; banner and overlay rules apply", async () => {
  const deps = { model: fakeModel({ getEntry: async (id) => (id === 9 ? entry() : id === 8 ? entry({ content_type: "color" }) : null) }), fetchImage: async () => image(1080, 1920) };
  const { values } = await validatePlacement({ content_id: 9, page_key: "app_launch", slot_key: "promo_splash", platform: "ios", display_seconds: 5 }, deps);
  assert.deepEqual(values, { content_id: 9, page_key: "app_launch", slot_key: "promo_splash", platform: "ios", audience: "all", frequency_rule: "once_per_day", display_seconds: 5, is_enabled: true });

  await assert.rejects(validatePlacement({ content_id: 9, page_key: "app_launch", slot_key: "hero_banner" }, deps), /Unknown page\/slot/);
  await assert.rejects(validatePlacement({ content_id: 9, page_key: "app_launch", slot_key: "promo_splash", platform: "web" }, deps), /platform must be one of/);
  await assert.rejects(validatePlacement({ content_id: 9, page_key: "app_launch", slot_key: "promo_splash", display_seconds: 11 }, deps), /from 1 to 10/);
  await assert.rejects(validatePlacement({ content_id: 9, page_key: "app_launch", slot_key: "promo_splash", display_seconds: 2.5 }, deps), /whole number/);
  await assert.rejects(validatePlacement({ content_id: 9, page_key: "step_counter", slot_key: "inline_banner", frequency_rule: "once_per_day" }, deps), /every_visit/);
  await assert.rejects(validatePlacement({ content_id: 9, page_key: "step_counter", slot_key: "inline_banner", display_seconds: 3 }, deps), /do not time out/);
  await assert.rejects(validatePlacement({ content_id: 404, page_key: "app_launch", slot_key: "promo_splash" }, deps), /not found/);
  await assert.rejects(validatePlacement({ content_id: 8, page_key: "app_launch", slot_key: "promo_splash" }, deps), /Only image content/);
  await assert.rejects(validatePlacement({ content_id: "1; DROP TABLE x", page_key: "app_launch", slot_key: "promo_splash" }, deps), /positive id/);

  const banner = await validatePlacement({ content_id: 9, page_key: "step_counter", slot_key: "inline_banner" }, deps);
  assert.equal(banner.values.frequency_rule, "every_visit");
  assert.equal(banner.values.display_seconds, null);
});

test("edits keep the slot rules and refuse to move a placement", () => {
  const current = { content_id: 9, page_key: "dashboard", slot_key: "entry_popup", frequency_rule: "once_per_day", display_seconds: null };
  assert.deepEqual(validatePlacementPatch({ is_enabled: false }, current), { is_enabled: false });
  assert.deepEqual(validatePlacementPatch({ display_seconds: 7 }, current), { frequency_rule: "once_per_day", display_seconds: 7 });
  assert.throws(() => validatePlacementPatch({ page_key: "products" }, current), /cannot be changed/);
  assert.throws(() => validatePlacementPatch({}, current), /Nothing to update/);
  assert.throws(() => validatePlacementPatch({ frequency_rule: "hourly" }, current), /frequency_rule must be one of/);
});

test("a default must be published, evergreen and live; skip needs no content", async () => {
  const entries = {
    1: entry({ content_id: 1 }),
    2: entry({ content_id: 2, end_utc: "2026-12-01 00:00:00" }),
    3: entry({ content_id: 3, is_published: 0, content_status: "draft" }),
    4: entry({ content_id: 4, content_status: "scheduled" }),
  };
  const deps = { model: fakeModel({ getEntry: async (id) => entries[id] || null }), fetchImage: async () => image(1080, 1920) };
  const base = { page_key: "app_launch", slot_key: "promo_splash" };
  assert.deepEqual((await validateDefault({ ...base }, deps)).values, { ...base, platform: "all", fallback_policy: "skip", default_content_id: null });
  assert.equal((await validateDefault({ ...base, fallback_policy: "show_content", default_content_id: 1, platform: "ios" }, deps)).values.default_content_id, 1);
  await assert.rejects(validateDefault({ ...base, fallback_policy: "show_content" }, deps), /needs default_content_id/);
  await assert.rejects(validateDefault({ ...base, fallback_policy: "show_content", default_content_id: 2 }, deps), /must not have an end date/);
  await assert.rejects(validateDefault({ ...base, fallback_policy: "show_content", default_content_id: 3 }, deps), /Publish the default/);
  await assert.rejects(validateDefault({ ...base, fallback_policy: "show_content", default_content_id: 4 }, deps), /already be live/);
  await assert.rejects(validateDefault({ ...base, fallback_policy: "show_content", default_content_id: 99 }, deps), /not found/);
});

/* ---------- resolution ---------- */

test("the first live campaign with usable artwork wins; a broken one is skipped", async () => {
  const model = fakeModel({
    liveCandidates: async () => [
      entry({ content_id: 1, placement_id: 10, image_path: null, priority: 9 }),
      entry({ content_id: 2, placement_id: 11, priority: 5, end_utc: "2026-11-05 06:31:30", frequency_rule: "once_per_session", display_seconds: 4 }),
    ],
  });
  const result = await resolve(model);
  assert.equal(result.source, "scheduled_campaign");
  assert.equal(result.campaign.content_id, 2);
  assert.equal(result.campaign.placement_id, 11);
  assert.equal(result.campaign.image_url, `https://cdn.rewardplanners.com/${CDN}`);
  assert.deepEqual(result.campaign.navigation, { destination: "product_details", targetId: 1125, contentId: 2 });
  assert.deepEqual(result.campaign.display, { frequency_rule: "once_per_session", display_seconds: 4, auto_dismiss: true, dismissible: true });
  assert.equal(result.server_time, "2026-11-05T06:30:00.000Z");
  assert.equal(result.expires_at, "2026-11-05T06:31:30.000Z");
  assert.equal(result.cache_ttl_seconds, 90, "the app re-asks when the campaign expires, not 5 minutes later");
});

test("with no campaign: platform default, 'skip' and invalid defaults", async () => {
  const live = entry({ content_id: 7 });
  const withDefault = (row, content = live) => fakeModel({ findDefault: async () => row, getEntry: async () => content });

  const shown = await resolve(withDefault({ fallback_policy: "show_content", default_content_id: 7 }));
  assert.equal(shown.source, "default");
  assert.equal(shown.campaign.content_id, 7);
  assert.equal(shown.campaign.placement_id, null);
  assert.equal(shown.campaign.display.display_seconds, 3, "defaults use the slot's documented display");

  assert.deepEqual((await resolve(withDefault({ fallback_policy: "skip", default_content_id: 7 }))).campaign, null);
  assert.equal((await resolve(withDefault({ fallback_policy: "skip", default_content_id: 7 }))).source, "none");
  assert.equal((await resolve(withDefault({ fallback_policy: "show_content", default_content_id: null }))).source, "none", "deleted default content");
  assert.equal((await resolve(withDefault({ fallback_policy: "show_content", default_content_id: 7 }, entry({ content_status: "draft", is_published: 0 })))).source, "none", "unpublished since it was saved");
  assert.equal((await resolve(withDefault({ fallback_policy: "show_content", default_content_id: 7 }, entry({ content_status: "expired" })))).source, "none", "given an end date since");
  assert.equal((await resolve(withDefault({ fallback_policy: "show_content", default_content_id: 7 }, entry({ image_path: null })))).source, "none", "artwork removed");
  assert.equal((await resolve(fakeModel())).source, "none", "nothing configured");
});

test("the cache hint ends when the next campaign starts, and is capped at five minutes", async () => {
  const next = await resolve(fakeModel({ nextStartUtc: async () => "2026-11-05 06:32:00" }));
  assert.equal(next.cache_ttl_seconds, 120);
  assert.equal(next.next_change_at, "2026-11-05T06:32:00.000Z");
  assert.equal((await resolve(fakeModel())).cache_ttl_seconds, 300);
});

test("the request must name a real page, slot and platform", async () => {
  await assert.rejects(resolve(fakeModel(), { pageKey: "nope" }), /Unknown page\/slot/);
  await assert.rejects(resolve(fakeModel(), { platform: "all" }), /android or ios/);
  await assert.rejects(resolve(fakeModel(), { audience: "everyone" }), /authenticated or guest/);
});
