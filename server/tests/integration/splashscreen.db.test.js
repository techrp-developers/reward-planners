// Splash screens against a real, DISPOSABLE MySQL database.
//
//   npm run test:splashscreen:db
//
// Creates rp_test_splash_<random>, copies only table STRUCTURE, applies the
// splash migration, seeds synthetic campaigns and drops the database
// afterwards. Artwork downloads are stubbed; nothing leaves the machine.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SERVER = path.join(__dirname, "../..");
require("dotenv").config({ path: path.join(SERVER, ".env"), quiet: true });
const mysql = require("mysql2/promise");

const ENABLED = process.env.RP_DISPOSABLE_DB_TESTS === "1" || process.env.npm_lifecycle_event === "test:splashscreen:db";
const SOURCE_DB = process.env.DB_NAME || "rewardplanners_db";
const TEST_DB = `rp_test_splash_${crypto.randomBytes(4).toString("hex")}`;
const TABLES = ["content_zone_entries", "content_zone_entry_images", "eusers", "customer", "vendors", "hr_account_approvals", "company_users"];
const SAFE_NAME = /^rp_test_splash_[0-9a-f]{8}$/;
const JWT_SECRET = process.env.JWT_SECRET || "test-dashboard-secret";
const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET || "test-app-secret";

if (!ENABLED) {
  test("disposable-database splash screen tests", { skip: "set RP_DISPOSABLE_DB_TESTS=1 (npm run test:splashscreen:db)" }, () => {});
} else {
  let admin;
  let db;
  let model;
  let service;
  let ContentZoneModel;
  let server;
  let origin;

  // Entries are written in UTC and stored the way the CMS stores them: in the
  // database session's time zone.
  const localOf = (utc) => (utc ? `CONVERT_TZ('${utc}', '+00:00', @@session.time_zone)` : "NULL");
  async function addEntry(id, { priority = 0, start = null, end = null, published = 1, image = `public/content-zone-entries/${id}/a.jpg`, type = "image", title = `Campaign ${id}` } = {}) {
    await admin.query(
      `INSERT INTO content_zone_entries (content_id, module, zone, content_type, display_mode, title, image_url, start_at, end_at, priority, is_default, is_published, target_type, target_id)
       VALUES (?, 'mobile_dashboard', 'promotional_banner', ?, 'single', ?, ?, ${localOf(start)}, ${localOf(end)}, ?, 0, ?, 'product', 1125)`,
      [id, type, title, image, priority, published],
    );
  }
  async function place(contentId, values = {}) {
    return model.createPlacement({ page_key: "app_launch", slot_key: "promo_splash", platform: "all", audience: "all", frequency_rule: "once_per_day", display_seconds: null, is_enabled: true, content_id: contentId, ...values });
  }
  const resolve = (args = {}) => service.resolveSplash({ pageKey: "app_launch", slotKey: "promo_splash", platform: "android", audience: "guest", ...args });
  const winner = async (args) => (await resolve(args)).campaign?.content_id ?? null;

  test.before(async () => {
    assert.match(TEST_DB, SAFE_NAME);
    assert.notEqual(TEST_DB, SOURCE_DB);
    admin = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root", password: process.env.DB_PASSWORD || "", multipleStatements: true,
    });
    await admin.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4`);
    for (const table of TABLES) await admin.query(`CREATE TABLE \`${TEST_DB}\`.\`${table}\` LIKE \`${SOURCE_DB}\`.\`${table}\``);
    await admin.query(`USE \`${TEST_DB}\``);
    await admin.query(fs.readFileSync(path.join(SERVER, "migrations/20261103_02_create_cms_splashscreens.sql"), "utf8"));
    await admin.query(
      `INSERT INTO eusers (user_id, name, email, role, is_verified) VALUES
       (7, 'Admin', 'admin@test.invalid', 'admin', 1), (8, 'Manager', 'vm@test.invalid', 'vendor_manager', 1), (18, 'RM', 'rm@test.invalid', 'rm', 1)`,
    );
    await admin.query("INSERT INTO customer (user_id, name, email, phone, password, status, is_verified) VALUES (501, 'Asha', 'asha@test.invalid', '9000000001', '', 1, 1)");

    process.env.DB_NAME = TEST_DB;
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.ACCESS_TOKEN_SECRET = ACCESS_SECRET;
    // Artwork checks download from the CDN; here every image is a valid 1080x1920 JPEG.
    const sharp = require("sharp");
    const artwork = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: "#852baf" } }).jpeg().toBuffer();
    const notificationImage = require(path.join(SERVER, "app/common/utils/notificationImage"));
    notificationImage.fetchAllowedImage = async () => artwork;

    db = require(path.join(SERVER, "config/database"));
    model = require(path.join(SERVER, "models/splashscreenModel"));
    service = require(path.join(SERVER, "services/splashscreenService"));
    ContentZoneModel = require(path.join(SERVER, "models/contentZoneModel"));

    const express = require("express");
    const app = express();
    app.use(express.json());
    app.use("/content", require(path.join(SERVER, "routes/contentRoutes")));
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  test.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await db?.end().catch(() => {});
    await require(path.join(SERVER, "middleware/splashLinkGuard")).closeLockPool();
    if (admin) {
      if (SAFE_NAME.test(TEST_DB)) await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
      await admin.end();
    }
  });

  test("start is inclusive, expiry exclusive, to the second", async () => {
    await addEntry(1, { priority: 1, start: "2026-11-10 03:30:00", end: "2026-11-10 05:30:00" });
    await place(1);
    assert.equal(await winner({ nowUtc: "2026-11-10 03:29:59" }), null, "not before its start");
    assert.equal(await winner({ nowUtc: "2026-11-10 03:30:00" }), 1, "live at its start");
    assert.equal(await winner({ nowUtc: "2026-11-10 05:29:59" }), 1);
    const atExpiry = await resolve({ nowUtc: "2026-11-10 05:30:00" });
    assert.equal(atExpiry.source, "none", "gone at its expiry");
    const live = await resolve({ nowUtc: "2026-11-10 05:00:00" });
    assert.equal(live.campaign.starts_at, "2026-11-10T03:30:00.000Z");
    assert.equal(live.expires_at, "2026-11-10T05:30:00.000Z", "stored local time is reported as the right UTC instant");
    assert.equal(live.cache_ttl_seconds, 300);
    assert.equal((await resolve({ nowUtc: "2026-11-10 05:28:00" })).cache_ttl_seconds, 120, "re-asked when it expires");
  });

  test("unpublished entries and disabled placements never show, whatever their priority", async () => {
    await addEntry(2, { priority: 90, start: "2026-11-10 03:00:00", published: 0 });
    await addEntry(3, { priority: 80, start: "2026-11-10 03:00:00" });
    await place(2);
    await place(3, { is_enabled: false });
    assert.equal(await winner({ nowUtc: "2026-11-10 04:00:00" }), 1);
  });

  test("higher priority wins; a campaign without an expiry keeps running", async () => {
    await addEntry(4, { priority: 5, start: "2026-11-10 04:00:00" });
    await place(4);
    assert.equal(await winner({ nowUtc: "2026-11-10 03:45:00" }), 1);
    assert.equal(await winner({ nowUtc: "2026-11-10 04:00:00" }), 4);
    assert.equal(await winner({ nowUtc: "2031-01-01 00:00:00" }), 4, "no end date");
    assert.equal((await resolve({ nowUtc: "2031-01-01 00:00:00" })).expires_at, null);
  });

  test("on equal priority a platform-specific, then audience-specific placement wins", async () => {
    await addEntry(5, { priority: 5, start: "2026-11-10 04:00:00" });
    await place(5, { platform: "android" });
    assert.equal(await winner({ nowUtc: "2026-11-10 06:00:00", platform: "android" }), 5);
    assert.equal(await winner({ nowUtc: "2026-11-10 06:00:00", platform: "ios" }), 4, "android-only is not sent to iOS");

    await addEntry(6, { priority: 5, start: "2026-11-10 04:00:00" });
    await place(6, { audience: "authenticated" });
    assert.equal(await winner({ nowUtc: "2026-11-10 06:00:00", platform: "ios", audience: "authenticated" }), 6);
    assert.equal(await winner({ nowUtc: "2026-11-10 06:00:00", platform: "ios", audience: "guest" }), 4, "signed-in only is not sent to guests");
  });

  test("on equal priority and specificity the later start wins; results are stable", async () => {
    await addEntry(7, { priority: 3, start: "2026-11-10 01:00:00", image: "public/content-zone-entries/7/a.jpg" });
    await addEntry(8, { priority: 3, start: "2026-11-10 02:00:00" });
    for (const id of [7, 8]) await place(id, { page_key: "dashboard", slot_key: "entry_popup" });
    const args = { pageKey: "dashboard", slotKey: "entry_popup", nowUtc: "2026-11-10 06:00:00" };
    assert.equal(await winner(args), 8);
    assert.equal(await winner(args), 8, "same answer every time");
  });

  test("gallery artwork comes first; a campaign with no artwork is skipped", async () => {
    await addEntry(9, { priority: 2, start: "2026-11-10 01:00:00", image: null });
    await addEntry(10, { priority: 1, start: "2026-11-10 01:00:00", image: null });
    await admin.query(
      `INSERT INTO content_zone_entry_images (content_id, image_url, sort_order, is_active) VALUES
       (10, 'public/content-zone-entries/10/hidden.jpg', 0, 0), (10, 'public/content-zone-entries/10/shown.jpg', 1, 1)`,
    );
    for (const id of [9, 10]) await place(id, { page_key: "rewards", slot_key: "entry_popup" });
    const result = await resolve({ pageKey: "rewards", slotKey: "entry_popup", nowUtc: "2026-11-10 06:00:00" });
    assert.equal(result.campaign.content_id, 10, "9 has no artwork at all");
    assert.equal(result.campaign.image_url, "https://cdn.rewardplanners.com/public/content-zone-entries/10/shown.jpg");
  });

  test("defaults: platform-specific first, 'skip', and deleted content", async () => {
    await addEntry(20, { start: "2026-01-01 00:00:00", title: "Evergreen shop" });
    await addEntry(21, { start: "2026-01-01 00:00:00", title: "Evergreen iOS" });
    const products = { pageKey: "products", slotKey: "hero_banner", nowUtc: "2026-11-10 06:00:00" };
    assert.equal((await resolve(products)).source, "none", "nothing configured");

    await model.upsertDefault({ page_key: "products", slot_key: "hero_banner", platform: "all", fallback_policy: "show_content", default_content_id: 20 });
    await model.upsertDefault({ page_key: "products", slot_key: "hero_banner", platform: "ios", fallback_policy: "show_content", default_content_id: 21 });
    const android = await resolve(products);
    assert.equal(android.source, "default");
    assert.equal(android.campaign.content_id, 20);
    assert.deepEqual(android.campaign.display, { frequency_rule: "every_visit", display_seconds: null, auto_dismiss: false, dismissible: false });
    assert.equal(await winner({ ...products, platform: "ios" }), 21);

    await model.upsertDefault({ page_key: "products", slot_key: "hero_banner", platform: "ios", fallback_policy: "skip", default_content_id: 21 });
    assert.equal((await resolve({ ...products, platform: "ios" })).source, "none", "skip shows nothing");

    await admin.query("DELETE FROM content_zone_entries WHERE content_id = 20");
    const [[row]] = await admin.query("SELECT default_content_id FROM cms_splashscreen_defaults WHERE page_key = 'products' AND platform = 'all'");
    assert.equal(row.default_content_id, null, "ON DELETE SET NULL");
    assert.equal((await resolve(products)).source, "none");
  });

  test("a scheduled campaign beats the default; removing its entry removes its placements", async () => {
    await addEntry(22, { priority: 1, start: "2026-11-10 05:00:00", end: "2026-11-10 07:00:00" });
    const placementId = await place(22, { page_key: "products", slot_key: "hero_banner", frequency_rule: "every_visit" });
    await model.upsertDefault({ page_key: "products", slot_key: "hero_banner", platform: "all", fallback_policy: "show_content", default_content_id: 21 });
    const products = { pageKey: "products", slotKey: "hero_banner", nowUtc: "2026-11-10 06:00:00" };
    assert.equal((await resolve(products)).source, "scheduled_campaign");
    assert.equal((await resolve({ ...products, nowUtc: "2026-11-10 07:00:00" })).source, "default", "falls back the moment it expires");

    await admin.query("DELETE FROM content_zone_entries WHERE content_id = 22");
    assert.equal(await model.getPlacement(placementId), null, "ON DELETE CASCADE");
  });

  test("the same placement cannot be added twice", async () => {
    await assert.rejects(place(1), (error) => error.code === "ER_DUP_ENTRY");
    assert.ok(await place(1, { platform: "ios" }), "a different platform is a different placement");
  });

  test("deactivating in the CMS stops the campaign on the very next request", async () => {
    await admin.query(
      `INSERT INTO content_zone_entries (content_id, module, zone, content_type, display_mode, title, image_url, start_at, end_at, priority, is_default, is_published)
       VALUES (30, 'mobile_dashboard', 'promotional_banner', 'image', 'single', 'Live now', 'public/content-zone-entries/30/a.jpg', NOW() - INTERVAL 1 HOUR, NULL, 99, 0, 1)`,
    );
    await place(30, { page_key: "bus_booking", slot_key: "entry_popup" });
    const now = { pageKey: "bus_booking", slotKey: "entry_popup" };
    assert.equal(await winner(now), 30, "uses the database clock when no time is given");
    await ContentZoneModel.deactivateNow(30);
    assert.equal(await winner(now), null);
  });

  /* ---------- HTTP and access control ---------- */

  const { generateToken } = require("../../utils/jwt");
  const jwt = require("jsonwebtoken");
  const dashboardToken = (userId) => generateToken({ user_id: userId, type: "access" });
  const call = async (method, url, { token, body } = {}) => {
    const response = await fetch(`${origin}${url}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  const SPLASH_ADMIN_ROUTES = [["GET", "/content/splashscreens/pages"], ["GET", "/content/splashscreens/placements"], ["POST", "/content/splashscreens/placements"],
    ["PATCH", "/content/splashscreens/placements/1"], ["DELETE", "/content/splashscreens/placements/999"], ["GET", "/content/splashscreens/defaults"],
    ["PUT", "/content/splashscreens/defaults"], ["POST", "/content/splashscreens/preview"]];

  test("splash management is for vendor managers only: admins and other roles get 403, anonymous 401", async () => {
    for (const [method, url] of SPLASH_ADMIN_ROUTES) {
      assert.equal((await call(method, url)).status, 401, `${method} ${url} without login`);
      assert.equal((await call(method, url, { token: dashboardToken(7) })).status, 403, `${method} ${url} as an admin`);
      assert.equal((await call(method, url, { token: dashboardToken(18) })).status, 403, `${method} ${url} as an RM`);
    }
    assert.equal((await call("GET", "/content/splashscreens/pages", { token: dashboardToken(8) })).status, 200);
    assert.equal((await call("GET", "/content/splashscreens/placements", { token: dashboardToken(8) })).status, 200);
  });

  test("CMS entry routes need a content admin", async () => {
    for (const [method, url] of [["GET", "/content/entries"], ["DELETE", "/content/entries/1"], ["GET", "/content/modules"]]) {
      assert.equal((await call(method, url)).status, 401, `${method} ${url} without login`);
      assert.equal((await call(method, url, { token: dashboardToken(18) })).status, 403, `${method} ${url} as an RM`);
    }
    assert.equal((await call("GET", "/content/entries", { token: dashboardToken(7) })).status, 200, "admins keep CMS access");
    assert.equal((await call("GET", "/content/entries", { token: dashboardToken(8) })).status, 200, "vendor managers keep CMS access");
    const [[stillThere]] = await admin.query("SELECT COUNT(*) AS n FROM content_zone_entries WHERE content_id = 1");
    assert.equal(stillThere.n, 1, "the anonymous DELETE did nothing");
  });

  test("placements over HTTP: create, list, duplicate, edit, remove", async () => {
    const token = dashboardToken(8);
    const created = await call("POST", "/content/splashscreens/placements", { token, body: { content_id: 21, page_key: "services", slot_key: "entry_popup", display_seconds: 5 } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const placement = created.body.data.placement;
    assert.equal(placement.display_seconds, 5);
    assert.equal(placement.content.status, "active");
    assert.deepEqual({ width: created.body.data.artwork.width, height: created.body.data.artwork.height }, { width: 1080, height: 1920 });

    const duplicate = await call("POST", "/content/splashscreens/placements", { token, body: { content_id: 21, page_key: "services", slot_key: "entry_popup" } });
    assert.equal(duplicate.status, 409);
    assert.equal((await call("POST", "/content/splashscreens/placements", { token, body: { content_id: 21, page_key: "services", slot_key: "promo_splash" } })).status, 400);

    const list = await call("GET", "/content/splashscreens/placements?page_key=services&pageSize=5", { token });
    assert.equal(list.body.data.total, 1);
    assert.equal(list.body.data.placements[0].id, placement.id);

    const edited = await call("PATCH", `/content/splashscreens/placements/${placement.id}`, { token, body: { is_enabled: false } });
    assert.equal(edited.body.data.placement.is_enabled, false);
    assert.equal((await call("PATCH", `/content/splashscreens/placements/${placement.id}`, { token, body: { page_key: "dashboard" } })).status, 400);

    assert.equal((await call("DELETE", `/content/splashscreens/placements/${placement.id}`, { token })).status, 200);
    assert.equal((await call("DELETE", `/content/splashscreens/placements/${placement.id}`, { token })).status, 404);
    const [[entry]] = await admin.query("SELECT COUNT(*) AS n FROM content_zone_entries WHERE content_id = 21");
    assert.equal(entry.n, 1, "removing a placement keeps the CMS entry");
  });

  test("defaults and preview over HTTP", async () => {
    const token = dashboardToken(8);
    const saved = await call("PUT", "/content/splashscreens/defaults", { token, body: { page_key: "app_launch", slot_key: "promo_splash", fallback_policy: "show_content", default_content_id: 1 } });
    assert.equal(saved.status, 422, "content with an end date cannot be a default");
    const ok = await call("PUT", "/content/splashscreens/defaults", { token, body: { page_key: "payments", slot_key: "hero_banner", fallback_policy: "show_content", default_content_id: 21 } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.ok((await call("GET", "/content/splashscreens/defaults", { token })).body.data.some((row) => row.page_key === "payments" && row.default_content_id === 21));

    const preview = await call("POST", "/content/splashscreens/preview", { token, body: { page_key: "app_launch", slot_key: "promo_splash", platform: "ios", audience: "guest", at: "2026-11-10T10:30:00+05:30" } });
    assert.equal(preview.body.data.campaign.content_id, 4, "10:30 IST is 05:00 UTC");
    assert.equal(preview.body.data.preview, true);
    assert.equal((await call("POST", "/content/splashscreens/preview", { token, body: { page_key: "app_launch", slot_key: "promo_splash", platform: "android", at: "2026-11-10 10:30" } })).status, 400, "a time without a zone is refused");
  });

  test("the app's endpoint is public and decides the audience from the token", async () => {
    const url = "/content/splashscreens/resolved?page_key=app_launch&slot_key=promo_splash&platform=ios";
    const guest = await call("GET", url);
    assert.equal(guest.status, 200);
    assert.equal(guest.body.data.audience, "guest");
    assert.ok(["scheduled_campaign", "default", "none"].includes(guest.body.data.source));
    assert.match(guest.body.data.server_time, /Z$/);

    const appToken = jwt.sign({ user_id: 501 }, ACCESS_SECRET);
    assert.equal((await call("GET", url, { token: appToken })).body.data.audience, "authenticated");
    assert.equal((await call("GET", `${url.replace("platform=ios", "platform=windows")}`)).status, 400);
    assert.equal((await call("GET", "/content/splashscreens/resolved?page_key=../etc&slot_key=x&platform=ios")).status, 400);
  });

  /* ---------- content linked to a splash campaign ---------- */

  test("an admin cannot change an entry used by a splash campaign; ordinary entries are unaffected", async () => {
    // Entry 4 is placed on app_launch; entry 40 is an ordinary CMS banner.
    await addEntry(40, { start: "2026-11-10 01:00:00" });
    const adminToken = dashboardToken(7);
    for (const [method, url] of [["PUT", "/content/entries/4"], ["PATCH", "/content/entries/4/deactivate"], ["DELETE", "/content/entries/4"],
      ["POST", "/content/entries/4/images"], ["PATCH", "/content/entries/4/images/reorder"], ["DELETE", "/content/entries/4/images/1"],
      ["PATCH", "/content/entries/4/images/1/target"], ["PATCH", "/content/entries/4/images/1/deactivate"], ["PATCH", "/content/entries/4/images/1/activate"],
      ["PUT", "/content/entries/4/discount-rule"], ["PUT", "/content/entries/4/product-pricing/1"], ["PUT", "/content/entries/4/service-pricing/1"],
      ["PUT", "/content/entries/4/bundle-pricing/1"], ["PUT", "/content/entries/21"]]) {
      const response = await call(method, url, { token: adminToken, body: {} });
      assert.equal(response.status, 403, `${method} ${url}`);
      assert.equal(response.body.code, "SPLASH_CAMPAIGN_CONTENT");
    }
    const [[still]] = await admin.query("SELECT is_published, end_at FROM content_zone_entries WHERE content_id = 4");
    assert.deepEqual([Number(still.is_published), still.end_at], [1, null], "nothing changed");

    const ordinary = await call("PATCH", "/content/entries/40/deactivate", { token: adminToken });
    assert.equal(ordinary.status, 200, JSON.stringify(ordinary.body));
    assert.equal((await call("GET", "/content/entries/4", { token: adminToken })).status, 200, "admins can still read it");
  });

  test("a vendor manager can change splash-linked artwork and schedule", async () => {
    const response = await call("PATCH", "/content/entries/4/deactivate", { token: dashboardToken(8) });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const [[row]] = await admin.query("SELECT end_at IS NOT NULL AS ended FROM content_zone_entries WHERE content_id = 4");
    assert.equal(Number(row.ended), 1);
  });

  test("linking waits for an edit in progress, so the two cannot interleave", async () => {
    await addEntry(41, { start: "2026-11-10 01:00:00" });
    // Stand in for an admin request holding entry 41 mid-edit.
    const editor = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root", password: process.env.DB_PASSWORD || "", database: TEST_DB,
    });
    try {
      const [[{ ok }]] = await editor.query("SELECT GET_LOCK('rp_cms_entry_41', 0) AS ok");
      assert.equal(Number(ok), 1);
      let finished = false;
      const linking = call("POST", "/content/splashscreens/placements", { token: dashboardToken(8), body: { content_id: 41, page_key: "insurance", slot_key: "inline_banner" } })
        .then((result) => { finished = true; return result; });
      await new Promise((resolve) => setTimeout(resolve, 800));
      assert.equal(finished, false, "the placement waits for the edit");
      await editor.query("SELECT RELEASE_LOCK('rp_cms_entry_41')");
      assert.equal((await linking).status, 201);
      // From now on the entry is a campaign: an admin edit is refused.
      assert.equal((await call("PATCH", "/content/entries/41/deactivate", { token: dashboardToken(7) })).status, 403);
    } finally {
      await editor.end();
    }
  });

  /* ---------- splash artwork never takes over its CMS zone ---------- */

  test("a splash campaign does not replace the dashboard banner, block its schedule or show in CMS lists", async () => {
    // A real dashboard promotional banner, and splash artwork in the same module/zone with a higher priority.
    await admin.query(
      `INSERT INTO content_zone_entries (content_id, module, zone, content_type, display_mode, title, image_url, start_at, end_at, priority, is_default, is_published)
       VALUES (50, 'mobile_dashboard', 'promotional_banner', 'image', 'single', 'Real dashboard banner', 'public/content-zone-entries/50/a.jpg', NOW() - INTERVAL 1 DAY, NULL, 1, 0, 1),
              (51, 'mobile_dashboard', 'promotional_banner', 'image', 'single', 'Splash artwork', 'public/content-zone-entries/51/a.jpg', NOW() - INTERVAL 1 HOUR, NULL, 99, 0, 0)`,
    );
    await place(51, { page_key: "dashboard", slot_key: "entry_popup" });

    // The vendor manager publishes the splash artwork while the dashboard banner is live: no overlap conflict.
    const published = await call("PUT", "/content/entries/51", { token: dashboardToken(8), body: { is_published: true } });
    assert.equal(published.status, 200, JSON.stringify(published.body));

    const zones = await ContentZoneModel.resolveAllZones("mobile_dashboard");
    assert.equal(zones.promotional_banner.content_id, 50, "the app's dashboard banner is unchanged");
    const listed = await ContentZoneModel.getEntries({ module: "mobile_dashboard", zone: "promotional_banner", pageSize: 50 });
    const ids = listed.entries.map((entry) => entry.content_id);
    assert.ok(ids.includes(50) && ids.includes(40), "ordinary banners are still listed");
    assert.ok(!ids.includes(51) && !ids.includes(4), "splash artwork is managed in the splash manager only");
    assert.equal(listed.total, ids.length);
    const conflicts = (await ContentZoneModel.findConflicts("mobile_dashboard", "promotional_banner", "2000-01-01", null, 50)).map((e) => e.content_id);
    assert.ok(!conflicts.includes(51), "splash artwork never blocks a dashboard banner's schedule");

    // It is still a live splash campaign.
    assert.equal(await winner({ pageKey: "dashboard", slotKey: "entry_popup" }), 51);
  });

  /* ---------- manager list and defaults ---------- */

  test("the manager list filters by status and search, counts each status, and says which campaign is actually showing", async () => {
    const token = dashboardToken(8);
    const all = (await call("GET", "/content/splashscreens/placements?pageSize=100", { token })).body.data;
    assert.equal(all.summary.total, all.total);
    assert.equal(all.summary.live + all.summary.scheduled + all.summary.draft + all.summary.expired + all.summary.disabled, all.summary.total);

    const live = (await call("GET", "/content/splashscreens/placements?status=live&pageSize=100", { token })).body.data;
    assert.ok(live.placements.length > 0);
    assert.ok(live.placements.every((p) => p.effective_status === "live"));
    assert.equal(live.total, all.summary.live);
    const disabled = (await call("GET", "/content/splashscreens/placements?status=disabled&pageSize=100", { token })).body.data;
    assert.ok(disabled.placements.every((p) => p.is_enabled === false && p.effective_status === "disabled"));

    // dashboard/entry_popup: 51 (priority 99) is shown; 52 (priority 5, also live) is eligible but loses.
    await admin.query(
      `INSERT INTO content_zone_entries (content_id, module, zone, content_type, display_mode, title, image_url, start_at, end_at, priority, is_default, is_published)
       VALUES (52, 'mobile_dashboard', 'promotional_banner', 'image', 'single', 'Runner-up', 'public/content-zone-entries/52/a.jpg', NOW() - INTERVAL 1 HOUR, NULL, 5, 0, 1)`,
    );
    await place(52, { page_key: "dashboard", slot_key: "entry_popup" });
    const dashboard = (await call("GET", "/content/splashscreens/placements?page_key=dashboard&slot_key=entry_popup&status=live", { token })).body.data.placements;
    const shown = dashboard.find((p) => p.content_id === 51);
    const eligible = dashboard.find((p) => p.content_id === 52);
    assert.equal(shown.showing_now.length, 4, "wins for both platforms and audiences");
    assert.deepEqual(eligible.showing_now, []);
    assert.equal(shown.content.image_url, "https://cdn.rewardplanners.com/public/content-zone-entries/51/a.jpg");

    const searched = (await call("GET", "/content/splashscreens/placements?search=Splash%20art", { token })).body.data;
    assert.deepEqual(searched.placements.map((p) => p.content_id), [51]);
  });

  test("a new default can be linked and published together, never live while unlinked", async () => {
    await admin.query(
      `INSERT INTO content_zone_entries (content_id, module, zone, content_type, display_mode, title, image_url, start_at, end_at, priority, is_default, is_published)
       VALUES (60, 'mobile_dashboard', 'promotional_banner', 'image', 'single', 'New default art', 'public/content-zone-entries/60/a.jpg', NULL, NULL, 99, 0, 0)`,
    );
    const token = dashboardToken(8);
    const body = { page_key: "investments", slot_key: "inline_banner", fallback_policy: "show_content", default_content_id: 60 };
    assert.equal((await call("PUT", "/content/splashscreens/defaults", { token, body })).status, 422, "unpublished content is refused without publish_content");
    const saved = await call("PUT", "/content/splashscreens/defaults", { token, body: { ...body, publish_content: true } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const [[entry]] = await admin.query("SELECT is_published, start_at IS NOT NULL AS started FROM content_zone_entries WHERE content_id = 60");
    assert.deepEqual([Number(entry.is_published), Number(entry.started)], [1, 1]);
    assert.equal(await winner({ pageKey: "investments", slotKey: "inline_banner" }), 60);
    assert.equal((await ContentZoneModel.resolveAllZones("mobile_dashboard")).promotional_banner.content_id, 50, "never took over the dashboard banner");
  });

  test("an empty end date clears it (No expiry), through the existing CMS update", async () => {
    await admin.query("UPDATE content_zone_entries SET end_at = NOW() + INTERVAL 1 DAY WHERE content_id = 52");
    const response = await call("PUT", "/content/entries/52", { token: dashboardToken(8), body: { end_at: "" } });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const [[row]] = await admin.query("SELECT end_at FROM content_zone_entries WHERE content_id = 52");
    assert.equal(row.end_at, null);
  });
}
