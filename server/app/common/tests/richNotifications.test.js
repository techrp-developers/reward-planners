const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const sharp = require("sharp");

// Unit tests never touch MySQL: swap the shared pool for a scripted fake.
let dbHandler = async () => [[]];
const fakeDb = { query: (...args) => dbHandler(...args), execute: (...args) => dbHandler(...args) };
const dbPath = require.resolve(path.join(__dirname, "../../../config/database"));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const { buildPushMessage } = require("../utils/notificationPayload");
const { destinationsForModule, resolveDestination, validateDestination, DESTINATIONS } = require("../utils/notificationDestinations");
const { assertAllowedUrl, checkImageAvailable, fetchAllowedImage, normalizeNotificationImage } = require("../utils/notificationImage");
const { mediaIdForLanguage, mediaLanguageWarnings, validateCampaignInput } = require("../utils/campaignRules");
const { buildCampaignPayload, buildDeliveryContext, processRecipient } = require("../../../services/Notifications/campaignWorker");
const NotificationModel = require("../models/notificationModel");

const image = (width, height, format = "png") => sharp({ create: { width, height, channels: 3, background: { r: 133, g: 43, b: 175 } } })[format]().toBuffer();
const response = (status, headers = {}, body = null) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  body: body && { getReader() { let sent = false; return { read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: body })), cancel: async () => {} }; } },
});

/* ---------- destination registry ---------- */

test("campaign destinations come from the registry and exclude private owner-only screens", () => {
  const ecommerce = destinationsForModule("ecommerce").map((item) => item.key);
  assert.ok(ecommerce.includes("product") && ecommerce.includes("cart") && ecommerce.includes("home"));
  assert.ok(!ecommerce.includes("order_details"));
  assert.ok(!destinationsForModule("service").some((item) => item.key === "service_order"));
  assert.ok(!destinationsForModule("busbooking").some((item) => item.key === "bus_booking"));
  assert.ok(DESTINATIONS.every((item) => ["verified", "not_in_app"].includes(item.mobileRoute)));
});

test("destinations are validated against module, entity and privacy", () => {
  assert.deepEqual(validateDestination({ module: "ecommerce", destinationType: "product", destinationId: "42" }).errors, []);
  assert.match(validateDestination({ module: "ecommerce", destinationType: "product" }).errors[0], /Select the product/);
  assert.match(validateDestination({ module: "service", destinationType: "product", destinationId: "1" }).errors[0], /different module/);
  assert.match(validateDestination({ module: "service", destinationType: "service_order", destinationId: "9" }).errors[0], /private/);
  assert.match(validateDestination({ module: "ecommerce", destinationType: "rp://evil" }).errors[0], /from the list/);
  assert.match(validateDestination({ module: "ecommerce", destinationType: "product", destinationId: "1;DROP" }).errors[0], /Select/);
  assert.deepEqual(validateDestination({ module: "games", destinationType: "notifications" }).errors, [], "common destinations work for any module");
});

test("resolved destinations give the app a screen, typed params, deep link and fallback", () => {
  const product = resolveDestination({ module: "ecommerce", destinationType: "product", destinationId: "42" });
  assert.equal(product.screen, "ProductDetails");
  assert.deepEqual(product.target_route, { path: ["App", "ProductDetails"], params: { productId: 42 } });
  assert.deepEqual(product.fallback_route, { path: ["App", "Home", "ProductModule", "Home"], params: {} });
  assert.equal(product.deep_link, "rp://product/42");
  const collection = resolveDestination({ module: "ecommerce", destinationType: "product_collection", productIds: [5, 9] });
  assert.deepEqual(collection.target_params, { productIds: ["5", "9"] });
  assert.equal(collection.deep_link, "rp://collection?ids=5,9");
  assert.equal(resolveDestination({ module: "wallet", destinationType: "wallet" }).fallback_screen, "WalletHistory");
});

/* ---------- FCM payload ---------- */

test("rich payload keeps legacy keys and uses only string data values", () => {
  const message = buildPushMessage({
    title: "Festive offers", message: "Explore", module: "ecommerce", type: "campaign_marketing", screen: "ProductDetails",
    image_url: "https://cdn.rewardplanners.com/public/notifications/2026/10/a.jpg",
    destination_type: "product", target_id: "42", target_params: { productId: "42" }, deep_link: "rp://product/42",
    fallback_screen: "EcommerceHome", language: "hi", notification_id: 77, metadata: { campaign_id: 5 },
  }, "token");
  assert.ok(Object.values(message.data).every((value) => typeof value === "string"));
  assert.equal(message.data.screen, "ProductDetails");
  assert.equal(message.data.target_screen, "ProductDetails");
  assert.equal(message.data.media_type, "image");
  assert.equal(message.data.target_params, "{\"productId\":\"42\"}");
  assert.equal(message.data.notification_id, "77");
  assert.equal(message.notification.imageUrl, message.android.notification.imageUrl);
  assert.equal(message.apns.payload.aps["mutable-content"], 1);
  assert.equal(message.apns.fcmOptions.imageUrl, message.notification.imageUrl);
});

test("standard and untrusted-image payloads stay text-only", () => {
  const standard = buildPushMessage({ title: "t", message: "m" }, "token");
  assert.equal(standard.data.media_type, "standard");
  assert.equal(standard.notification.imageUrl, undefined);
  assert.equal(standard.apns.payload.aps["mutable-content"], undefined);
  const untrusted = buildPushMessage({ title: "t", message: "m", image_url: "https://evil.example.com/x.jpg" }, "token");
  assert.equal(untrusted.data.media_type, "standard");
  assert.equal(untrusted.android.notification.imageUrl, undefined);
});

/* ---------- image pipeline ---------- */

test("images are decoded and re-encoded to a 1200x600 JPEG", async () => {
  const out = await normalizeNotificationImage(await image(1800, 1800, "webp"));
  assert.equal(out.mimeType, "image/jpeg");
  assert.deepEqual([out.width, out.height], [1200, 600]);
  assert.ok(out.bytes <= 300 * 1024);
  const meta = await sharp(out.buffer).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.exif, undefined, "metadata stripped");
});

test("invalid, tiny, mislabelled and non-image uploads are rejected", async () => {
  await assert.rejects(normalizeNotificationImage(Buffer.from("not an image")), /readable image/);
  await assert.rejects(normalizeNotificationImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), /readable image/);
  await assert.rejects(normalizeNotificationImage(await image(200, 100)), /at least 300/);
  await assert.rejects(normalizeNotificationImage(await image(1200, 600, "png"), { declaredMime: "image/jpeg" }), /does not match/);
  await assert.rejects(normalizeNotificationImage(Buffer.alloc(6 * 1024 * 1024)), /5 MB/);
});

test("only HTTPS URLs on the asset host are ever fetched (SSRF guard)", async () => {
  for (const url of ["http://cdn.rewardplanners.com/a.jpg", "https://169.254.169.254/latest", "https://cdn.rewardplanners.com.evil.io/a.jpg", "https://u:p@cdn.rewardplanners.com/a.jpg", "file:///etc/passwd"]) {
    assert.throws(() => assertAllowedUrl(url), url);
  }
  let options;
  const png = await image(600, 300);
  const fetched = await fetchAllowedImage("https://cdn.rewardplanners.com/a.png", {
    fetchImpl: async (_url, init) => { options = init; return response(200, { "content-type": "image/png" }, png); },
  });
  assert.equal(options.redirect, "error", "redirects are refused");
  assert.equal(fetched.length, png.length);
  await assert.rejects(fetchAllowedImage("https://cdn.rewardplanners.com/a.png", { fetchImpl: async () => response(200, { "content-type": "text/html" }, Buffer.from("x")) }), /not an image/);
  await assert.rejects(fetchAllowedImage("https://cdn.rewardplanners.com/a.png", { fetchImpl: async () => response(200, { "content-type": "image/png", "content-length": String(9e6) }, png) }), /too large/);
});

test("delivery checks reject missing, broken, oversized and wrong-type images", async () => {
  const url = "https://cdn.rewardplanners.com/public/notifications/a.jpg";
  assert.deepEqual(await checkImageAvailable(url, { fetchImpl: async () => response(200, { "content-type": "image/jpeg", "content-length": "40000" }) }), { ok: true, bytes: 40000 });
  assert.equal((await checkImageAvailable(url, { fetchImpl: async () => response(404) })).ok, false);
  assert.match((await checkImageAvailable(url, { fetchImpl: async () => response(200, { "content-type": "image/webp" }) })).reason, /Unsupported/);
  assert.match((await checkImageAvailable(url, { fetchImpl: async () => response(200, { "content-type": "image/jpeg", "content-length": String(2e6) }) })).reason, /larger than 300 KB/);
  assert.equal((await checkImageAvailable(url, { fetchImpl: async () => { throw new Error("timeout"); } })).ok, false);
});

/* ---------- campaign rules ---------- */

const manual = (overrides = {}) => ({ name: "Festive", module: "ecommerce", category: "marketing", title_en: "Festive offers", body_en: "Explore", ...overrides });

test("content types: standard clears media; image and catalog require an image", () => {
  assert.equal(validateCampaignInput(manual({ media: { default: 3 } })).value.media, null);
  assert.ok(validateCampaignInput(manual({ content_type: "image" })).errors.some((error) => /Add an image/.test(error)));
  const { value, errors } = validateCampaignInput(manual({ content_type: "image", media: { default: 3, hi: 4, bogus: 9, mr: "x" } }));
  assert.deepEqual(errors, []);
  assert.deepEqual(value.media, { default: 3, hi: 4 });
  assert.equal(value.image_url, null, "free-text image URLs are never accepted");
});

test("catalog notifications pick their destination from the product count", () => {
  const one = validateCampaignInput(manual({ content_type: "catalog", media: { default: 1 }, catalog_product_ids: [42] })).value;
  assert.equal(one.destination_type, "product");
  assert.equal(one.destination_id, "42");
  assert.equal(one.target_screen, "ProductDetails");
  const many = validateCampaignInput(manual({ content_type: "catalog", media: { default: 1 }, catalog_product_ids: [42, 43, 43] })).value;
  assert.equal(many.destination_type, "product_collection");
  assert.deepEqual(many.catalog_product_ids, [42, 43]);
  assert.ok(validateCampaignInput(manual({ module: "service", content_type: "catalog", media: { default: 1 }, catalog_product_ids: [1] })).errors.some((error) => /E-commerce/.test(error)));
});

test("localized images: per-language first, then default", () => {
  assert.equal(mediaIdForLanguage({ default: 1, hi: 2 }, "hi"), 2);
  assert.equal(mediaIdForLanguage({ default: 1, hi: 2 }, "mr"), 1);
  assert.equal(mediaIdForLanguage({ en: 5 }, "mr"), 5);
  assert.equal(mediaIdForLanguage(null, "en"), null);
});

test("warn when an image with English text would go to Marathi recipients", () => {
  const campaign = { content_type: "image", media: { default: 1 }, approved_languages: "mr", title_mr: "शीर्षक" };
  const warnings = mediaLanguageWarnings(campaign, new Map([[1, { media_id: 1, language: "en" }]]));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /MR recipients will see an image containing EN text/);
  assert.deepEqual(mediaLanguageWarnings({ ...campaign, media: { default: 1, mr: 2 } }, new Map([[1, { language: "en" }], [2, { language: "mr" }]])), []);
  assert.deepEqual(mediaLanguageWarnings(campaign, new Map([[1, { language: null }]])), [], "language-neutral images are fine");
});

/* ---------- worker: send-time checks ---------- */

const campaign = {
  campaign_id: 9, status: "sending", category: "marketing", module: "ecommerce", priority: "normal", content_type: "catalog",
  title_en: "Deals", body_en: "Hi {{first_name}}", approved_languages: "", variables: {},
  destination_type: "product_collection", destination_id: null, catalog_product_ids: [1, 2], media: { default: 11, hi: 12 },
};
const fakeMedia = (products, rows = [{ media_id: 11, public_url: "https://cdn.rewardplanners.com/a.jpg" }, { media_id: 12, public_url: "https://cdn.rewardplanners.com/b.jpg" }]) => ({
  entityStatus: async () => ({ ok: products.some((product) => product.available), products }),
  findActiveByIds: async () => rows,
});

test("send time drops unavailable products and blocks when none remain", async () => {
  const context = await buildDeliveryContext(campaign, {
    media: fakeMedia([{ product_id: 1, available: true }, { product_id: 2, available: false }]),
    checkImage: async () => ({ ok: true }),
  });
  assert.equal(context.blocked, null);
  assert.deepEqual(context.destination.target_params, { productIds: ["1"] });

  const blocked = await buildDeliveryContext(campaign, { media: fakeMedia([{ product_id: 1, available: false }]), checkImage: async () => ({ ok: true }) });
  assert.equal(blocked.blocked, "destination_unavailable");
  const update = await processRecipient({ recipient_id: 1, user_id: 5, occurrence_no: 1, attempts: 0 }, campaign, { marketing_enabled: 1 }, new Date(), {
    delivery: blocked, deliver: async () => { throw new Error("must not send"); }, countToday: async () => 0,
  });
  assert.equal(update.skip_reason, "destination_unavailable");
});

test("broken images fall back to text; localized images follow the recipient language", async () => {
  const context = await buildDeliveryContext(campaign, {
    media: fakeMedia([{ product_id: 1, available: true }]),
    checkImage: async (url) => ({ ok: !url.endsWith("b.jpg") }),
  });
  assert.equal(context.images.en.url, "https://cdn.rewardplanners.com/a.jpg");
  assert.equal(context.images.hi, null);
  assert.equal(context.imageFallback.hi, true);

  const recipient = { user_id: 5, occurrence_no: 1 };
  const en = buildCampaignPayload(campaign, recipient, { title: "t", message: "m", language: "en" }, context);
  assert.equal(en.image_url, "https://cdn.rewardplanners.com/a.jpg");
  assert.equal(en.metadata.media_id, 11);
  // No collection screen exists in the app: the shop home is the safe target.
  assert.equal(en.screen, "Home");
  assert.deepEqual(en.target_route.path, ["App", "Home", "ProductModule", "Home"]);
  assert.equal(en.deep_link, "rp://collection?ids=1");
  const hi = buildCampaignPayload(campaign, recipient, { title: "t", message: "m", language: "hi" }, context);
  assert.equal(hi.image_url, undefined);
  assert.equal(hi.metadata.image_fallback, true);

  // The image follows the language actually sent: an approved Hindi text gets
  // the Hindi image (broken here, so text-only); unapproved Hindi would get English + English image.
  const hindi = { ...campaign, title_hi: "डील्स", body_hi: "नमस्ते {{first_name}}", approved_languages: "hi" };
  const update = await processRecipient({ recipient_id: 1, user_id: 5, occurrence_no: 1, attempts: 0, customer_name: "Asha" }, hindi, { marketing_enabled: 1, language: "hi" }, new Date("2026-11-02T06:30:00Z"), {
    delivery: context, countToday: async () => 0,
    deliver: async () => ({ success: true, sent: 1, notificationId: 3, results: [{ success: true }] }),
  });
  assert.equal(update.status, "sent");
  assert.equal(update.image_fallback, 1);
});

/* ---------- tap tracking ---------- */

test("an open event is only recorded for the employee's own notification", async () => {
  const calls = [];
  dbHandler = async (sql, params) => {
    calls.push(sql);
    if (/FROM notifications/.test(sql)) return [[params[1] === 5 ? { notification_id: params[0], campaign_id: "9" } : undefined]];
    if (/INSERT IGNORE INTO notification_open_events/.test(sql)) return [{ affectedRows: 1 }];
    return [[]];
  };
  assert.equal(await NotificationModel.recordOpen(6, 100, {}), null, "another user's notification");
  assert.equal(calls.some((sql) => /INSERT/.test(sql)), false);
  assert.equal(await NotificationModel.recordOpen(5, 100, { outcome: "fallback", destinationType: "product" }), true);
  dbHandler = async () => [[]];
});
