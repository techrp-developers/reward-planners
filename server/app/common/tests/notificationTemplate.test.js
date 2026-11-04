const test = require("node:test");
const assert = require("node:assert/strict");
const catalog = require("../../../data/notification-templates-v1.json");
const {
  TemplateRenderError,
  buildTemplateNotification,
  checkPromotionalEligibility,
  isWithinQuietHours,
  listPlaceholders,
  renderText,
  resolveLanguage,
} = require("../utils/notificationTemplate");

const byKey = Object.fromEntries(catalog.templates.map((t) => [t.template_key, t]));

test("catalog contains the 51 disabled templates with unique keys", () => {
  assert.equal(catalog.templates.length, 51);
  assert.equal(new Set(catalog.templates.map((t) => t.template_key)).size, 51);
  assert.ok(catalog.templates.every((t) => t.enabled_by_default === false));
});

test("placeholders are replaced and values are sanitised", () => {
  assert.equal(renderText("Order #{{order_id}} for {{ name }}", { order_id: 42, name: "A\nB" }), "Order #42 for A B");
});

test("missing placeholder values are rejected instead of rendered", () => {
  assert.throws(
    () => renderText("Order #{{order_id}}", {}),
    (error) => error instanceof TemplateRenderError && error.missing.includes("order_id"),
  );
  assert.throws(() => renderText("{{points}} points", { points: { toString: () => "5" } }), TemplateRenderError);
});

test("every catalog template renders once its placeholders are supplied", () => {
  for (const template of catalog.templates) {
    const names = [
      ...listPlaceholders(template.title_en),
      ...listPlaceholders(template.body_en),
    ];
    const variables = Object.fromEntries(names.map((name) => [name, "x"]));
    const payload = buildTemplateNotification(template, { userId: 1, variables });
    assert.ok(payload.title && !payload.title.includes("{{"), template.template_key);
    assert.ok(payload.message && !payload.message.includes("{{"), template.template_key);
  }
});

test("draft translations fall back to English until approved", () => {
  const draft = byKey.good_morning;
  assert.equal(resolveLanguage(draft, "hi"), "en");
  assert.equal(resolveLanguage({ ...draft, localization_status: "en_mr_hi_approved" }, "hi"), "hi");
  assert.equal(resolveLanguage({ ...byKey.order_confirmed, localization_status: "approved" }, "mr"), "en");
  assert.equal(resolveLanguage(draft, "fr"), "en");
});

test("catalog modules and keys map onto existing backend events", () => {
  const order = buildTemplateNotification(byKey.order_confirmed, {
    userId: 7,
    variables: { order_id: 42 },
    reference_type: "order",
    reference_id: 42,
  });
  assert.equal(order.module, "ecommerce");
  assert.equal(order.type, "order_paid");
  assert.equal(order.metadata.deep_link, "rp://order/42");
  assert.equal(order.action_url, undefined, "rp:// links are not used for navigation yet");

  assert.equal(buildTemplateNotification(byKey.chat_message, { variables: { sender_name: "Asha" } }).module, "chat");
  assert.equal(buildTemplateNotification(byKey.step_near_goal, { variables: { steps_remaining: 500 } }).module, "fitness");
  assert.equal(buildTemplateNotification(byKey.bus_status_changed, { variables: { booking_id: "B1" } }).module, "busbooking");
  // Unmapped templates keep their own key rather than borrowing an unrelated type.
  assert.equal(buildTemplateNotification(byKey.order_rto, { variables: { order_id: 1 } }).type, "order_rto");
});

test("transactional sends ignore marketing preferences", () => {
  assert.deepEqual(
    checkPromotionalEligibility({ category: "transactional", preferences: null }),
    { allowed: true },
  );
});

test("marketing respects preferences, quiet hours and the daily cap", () => {
  const prefs = { marketing_enabled: 1, engagement_enabled: 1 };
  assert.equal(checkPromotionalEligibility({ category: "marketing", preferences: null }).reason, "preferences_unavailable");
  assert.equal(
    checkPromotionalEligibility({ category: "marketing", preferences: { ...prefs, marketing_enabled: 0 } }).reason,
    "opted_out",
  );
  assert.equal(
    checkPromotionalEligibility({
      category: "engagement",
      preferences: { ...prefs, quiet_hours_start: "21:00:00", quiet_hours_end: "08:00:00" },
      nowMinutes: 23 * 60,
    }).reason,
    "quiet_hours",
  );
  assert.equal(
    checkPromotionalEligibility({ category: "marketing", preferences: prefs, sentToday: 2, dailyCap: 2 }).reason,
    "daily_cap_reached",
  );
  assert.equal(
    checkPromotionalEligibility({ category: "marketing", preferences: prefs, sentToday: 1, dailyCap: 2, nowMinutes: 600 }).allowed,
    true,
  );
});

test("quiet hours handle windows that cross midnight", () => {
  assert.equal(isWithinQuietHours("21:00", "08:00", 7 * 60), true);
  assert.equal(isWithinQuietHours("21:00", "08:00", 12 * 60), false);
  assert.equal(isWithinQuietHours("13:00", "14:00", 13 * 60 + 30), true);
  assert.equal(isWithinQuietHours(null, null, 0), false);
});
