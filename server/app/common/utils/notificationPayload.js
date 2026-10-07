const crypto = require("node:crypto");

const SCREEN_BY_MODULE = {
  bbps: "BbpsHome",
  common: "Notifications",
  ecommerce: "EcommerceHome",
  fitness: "FitnessDashboard",
  games: "GamesHome",
  service: "ServiceHome",
  todo: "TodoList",
  wallet: "Wallet",
};

const IDEMPOTENT_TYPES = new Set([
  "account_activated",
  "bbps_payment_success",
  "bbps_refund_completed",
  "delivery",
  "order_paid",
  "order_shipped",
  "order_out_for_delivery",
  "refund_completed",
  "service_order_paid",
  "service_refund_completed",
]);

const DEFAULT_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

function buildWindowedIdempotencyKey(payload, now = Date.now()) {
  if (payload.allow_duplicates === true) return undefined;

  const configuredWindow = Number(payload.dedupe_window_ms);
  const windowMs = Number.isFinite(configuredWindow) && configuredWindow > 0
    ? configuredWindow
    : DEFAULT_DEDUPE_WINDOW_MS;
  const bucket = Math.floor(now / windowMs);
  const fingerprint = [
    payload.userId ?? payload.user_id ?? "",
    payload.module ?? "",
    payload.type ?? "",
    payload.reference_type ?? "",
    payload.reference_id ?? "",
    payload.title ?? "",
    payload.message ?? "",
    bucket,
  ].join("|");

  return `window:${crypto.createHash("sha256").update(fingerprint).digest("hex")}`;
}

function inferScreen(data) {
  if (data.screen) return data.screen;
  const url = String(data.action_url || "");
  if (url.includes("order-details")) return "OrderDetails";
  if (url.includes("service-order")) return "ServiceOrderDetails";
  if (url.includes("support")) return "Support";
  if (url.includes("wallet")) return "Wallet";
  if (url.includes("profile")) return "Profile";
  if (url.includes("cart")) return "Cart";
  return SCREEN_BY_MODULE[data.module] || "Notifications";
}

function buildNotificationPayload(data) {
  const payload = {
    priority: "normal",
    reference_type: "none",
    ...data,
    screen: inferScreen(data),
  };

  const userId = payload.userId ?? payload.user_id;
  if (!payload.idempotency_key && IDEMPOTENT_TYPES.has(payload.type) &&
      userId && payload.reference_id != null) {
    payload.idempotency_key = [userId, payload.module, payload.type, payload.reference_id].join(":");
  }

  // Protect every producer from concurrent/retried sends. Event notifications
  // above retain their permanent key; ordinary notifications can recur after
  // the short window. Callers with a business-specific cadence should provide
  // an explicit idempotency_key.
  if (!payload.idempotency_key) {
    payload.idempotency_key = buildWindowedIdempotencyKey(payload);
  }

  return payload;
}

function buildPushMessage(data, fcmToken) {
  return {
    notification: {
      title: data.title || "Notification",
      body: data.message || "",
    },
    data: {
      module: String(data.module || ""),
      type: String(data.type || ""),
      reference_type: String(data.reference_type || ""),
      reference_id: String(data.reference_id || ""),
      action_url: String(data.action_url || ""),
      screen: String(data.screen || ""),
      priority: String(data.priority || "normal"),
    },
    android: {
      priority: "high",
      notification: {
        channelId: "reward_planners_general",
        sound: "default",
        defaultSound: true,
        vibrateTimingsMillis: [0, 1000, 500, 1000, 500],
      },
    },
    token: fcmToken,
  };
}

module.exports = {
  buildNotificationPayload,
  buildPushMessage,
  buildWindowedIdempotencyKey,
  inferScreen,
};
