const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// The destination contract shared with the mobile app: what a campaign
// stores, what FCM carries and what the inbox API returns. MySQL and the
// notification sender are replaced before anything loads.
let dbHandler = async () => [[]];
const fakeDb = { query: (...args) => dbHandler(...args), execute: (...args) => dbHandler(...args) };
const stub = (relative, exports) => {
  const file = require.resolve(path.join(__dirname, relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub("../../../config/database", fakeDb);

const { buildNotificationPayload, buildPushMessage } = require("../utils/notificationPayload");
const { normalizeNotificationDestination, resolveDestination } = require("../utils/notificationDestinations");
const { validateCampaignInput } = require("../utils/campaignRules");
const { buildCampaignPayload } = require("../../../services/Notifications/campaignWorker");
const notificationController = require("../controller/notificationController");

const campaign = (overrides = {}) => ({
  campaign_id: 40, module: "common", category: "marketing", priority: "normal", content_type: "standard", title_en: "T", ...overrides,
});
const rendered = { title: "Love Shopping?", message: "Body", language: "en" };

/** Campaign -> stored inbox row (as MySQL returns it) and the FCM data. */
function deliver(row) {
  const delivery = { destination: resolveDestination({ module: row.module, destinationType: row.destination_type, destinationId: row.destination_id }), images: {}, imageFallback: {} };
  const payload = buildNotificationPayload(buildCampaignPayload(row, { user_id: 7, occurrence_no: 1 }, rendered, delivery));
  const metadata = JSON.parse(JSON.stringify({ ...payload.metadata, screen: payload.screen }));
  return {
    metadata,
    fcm: buildPushMessage({ ...payload, notification_id: 501 }, "token").data,
    inbox: normalizeNotificationDestination({ notification_id: 501, module: payload.module, action_url: null, metadata }),
  };
}

test("product 1125 keeps its id in metadata, FCM data and the inbox destination", () => {
  const { metadata, fcm, inbox } = deliver(campaign({ destination_type: "product", destination_id: "1125" }));
  const route = { path: ["App", "ProductDetails"], params: { productId: 1125 } };

  assert.equal(metadata.destination_id, "1125");
  assert.deepEqual(metadata.destination, { type: "product", id: "1125", route, fallback_route: { path: ["App", "Notification"], params: {} }, deep_link: "rp://product/1125" });
  assert.equal(fcm.destination_type, "product");
  assert.equal(fcm.target_id, "1125");
  assert.deepEqual(JSON.parse(fcm.target_route), route);
  assert.equal(fcm.notification_id, "501");
  assert.deepEqual({ ...inbox, fallback_route: undefined }, { type: "product", id: "1125", route, fallback_route: undefined, deep_link: "rp://product/1125", source: "metadata" });
});

test("notification_details opens the inbox detail view for the row itself", () => {
  const { fcm, inbox } = deliver(campaign({ category: "announcement", destination_type: "notification_details" }));
  assert.equal(fcm.destination_type, "notification_details");
  assert.deepEqual(JSON.parse(fcm.target_route), { path: ["App", "Notification"], params: {} });
  assert.equal(fcm.notification_id, "501", "the app adds notificationId from the push");
  assert.equal(inbox.id, "501");
  assert.deepEqual(inbox.route, { path: ["App", "Notification"], params: { notificationId: 501 } });
});

test("rows stored before metadata kept the id recover it from their own route", () => {
  const destination = normalizeNotificationDestination({
    notification_id: 2, module: "ecommerce",
    metadata: { destination_type: "product", target_route: { path: ["App", "ProductDetails"], params: { productId: 1125 } } },
  });
  assert.equal(destination.id, "1125");
  assert.equal(destination.deep_link, "rp://product/1125");
  assert.equal(destination.source, "metadata");
});

test("legacy rows map only through explicit action_url patterns", () => {
  const legacy = (action_url, extra = {}) => normalizeNotificationDestination({ notification_id: 1, module: "common", action_url, metadata: {}, ...extra });

  assert.deepEqual(legacy("/orders/order-details/42").route, { path: ["App", "OrderConfirmedScreen"], params: { order_id: 42 } });
  assert.equal(legacy("/orders/order-details/42").id, "42");
  assert.deepEqual(legacy("/service-orders/PO-9").route.params, { parent_order_id: "PO-9" });
  for (const url of ["/fitness", "/fitness/achievements", "/fitness/wallet"]) {
    assert.deepEqual(legacy(url).route.path, ["App", "RewardStack", "Dashboard"], url);
  }
  assert.equal(legacy("/wallet").type, "wallet");
  assert.equal(legacy("/somewhere/unknown").source, "none");
  assert.equal(legacy(null, { metadata: { screen: "Notifications" } }).source, "none", "the default common screen is not a destination");
  assert.equal(legacy(null, { reference_type: "service_order", reference_id: "PO-1" }).type, "service_order");
});

test("a named but unusable destination is reported unavailable, never guessed", () => {
  const row = (metadata) => normalizeNotificationDestination({ notification_id: 1, module: "common", title: "Product 1125 sale", metadata });
  assert.equal(row({ destination_type: "product" }).source, "unavailable", "no id");
  assert.equal(row({ destination_type: "no_such_screen" }).source, "unavailable");
  assert.equal(row({ destination_type: "product" }).route, null);
});

test("legacy campaigns that chose the inbox keep that choice", () => {
  const { inbox } = deliver(campaign({ category: "announcement", destination_type: "notifications" }));
  assert.equal(inbox.type, "notifications");
  assert.deepEqual(inbox.route.path, ["App", "Notification"]);
});

test("common marketing may open a product; an announcement may not", () => {
  const errors = (category, destination_type) => validateCampaignInput({
    name: "x", source: "manual", module: "common", category, announcement_type: "company_update",
    title_en: "Hello", body_en: "Team update", destination_type, destination_id: "1125",
  }).errors;
  assert.deepEqual(errors("marketing", "product"), []);
  assert.ok(errors("announcement", "product").some((error) => /Announcements may only open/.test(error)));
  assert.deepEqual(errors("announcement", "notification_details"), []);
});

function fakeRes() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("GET one notification is owner-scoped and returns the destination", async () => {
  const calls = [];
  dbHandler = async (sql, params) => {
    calls.push(params);
    return params[0] === 501 && params[1] === 7
      ? [[{ notification_id: 501, module: "common", metadata: JSON.stringify({ destination_type: "product", destination_id: "1125", destination: { type: "product", id: "1125", route: { path: ["App", "ProductDetails"], params: { productId: 1125 } } } }) }]]
      : [[]];
  };

  const ok = fakeRes();
  await notificationController.getNotification({ user: { user_id: 7 }, params: { notification_id: "501" } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.data.destination.id, "1125");
  assert.deepEqual(calls.at(-1), [501, 7]);

  const other = fakeRes();
  await notificationController.getNotification({ user: { user_id: 8 }, params: { notification_id: "501" } }, other);
  assert.equal(other.statusCode, 404);

  const bad = fakeRes();
  await notificationController.getNotification({ user: { user_id: 7 }, params: { notification_id: "abc" } }, bad);
  assert.equal(bad.statusCode, 400);
});

test("bus booking confirmation carries the booking destination", () => {
  const destination = resolveDestination({ module: "busbooking", destinationType: "bus_booking", destinationId: "RPB123" });
  const payload = buildNotificationPayload({ userId: 7, module: "busbooking", type: "bus_booking_confirmed", title: "Bus ticket confirmed", message: "m", reference_type: "bus_booking", reference_id: "RPB123", ...destination });
  assert.deepEqual(payload.metadata.destination.route, { path: ["App", "Home", "DineOutModule", "BusOrderDetailScreen"], params: { orderRef: "RPB123" } });
  assert.equal(buildPushMessage(payload, "t").data.target_id, "RPB123");
  assert.equal(buildPushMessage(payload, "t").data.android_channel_id, "reward_planners_general", "transactional channel");
});
