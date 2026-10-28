const crypto = require("node:crypto");
const { legacyRouteForScreen } = require("./notificationDestinations");

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

// Notification images are fetched by the phone, so only HTTPS URLs on our own
// asset hosts are forwarded.
const IMAGE_HOSTS = String(process.env.NOTIFICATION_IMAGE_HOSTS || "cdn.rewardplanners.com")
  .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);

function safeImageUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && IMAGE_HOSTS.includes(url.hostname.toLowerCase()) ? url.toString() : null;
  } catch {
    return null;
  }
}

// Optional routing/media keys. Existing app builds ignore unknown keys and
// keep using `screen`; new builds read the destination fields.
const OPTIONAL_DATA_KEYS = ["destination_type", "target_id", "deep_link", "fallback_screen", "language"];

function buildPushMessage(data, fcmToken) {
  const imageUrl = safeImageUrl(data.image_url);
  const campaignId = data.metadata?.campaign_id;
  const optional = {};
  for (const key of OPTIONAL_DATA_KEYS) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== "") optional[key] = String(data[key]);
  }
  if (data.target_params && Object.keys(data.target_params).length) optional.target_params = JSON.stringify(data.target_params);
  // Full navigator path for new app builds; system notifications derive it
  // from their existing screen name. Old builds ignore these keys.
  const targetRoute = data.target_route || legacyRouteForScreen(data.screen);
  if (targetRoute) optional.target_route = JSON.stringify(targetRoute);
  if (data.fallback_route) optional.fallback_route = JSON.stringify(data.fallback_route);

  return {
    notification: {
      title: data.title || "Notification",
      body: data.message || "",
      ...(imageUrl ? { imageUrl } : {}),
    },
    // FCM data values must all be strings.
    data: {
      module: String(data.module || ""),
      type: String(data.type || ""),
      reference_type: String(data.reference_type || ""),
      reference_id: String(data.reference_id || ""),
      action_url: String(data.action_url || ""),
      screen: String(data.screen || ""),
      target_screen: String(data.screen || ""),
      priority: String(data.priority || "normal"),
      media_type: imageUrl ? "image" : "standard",
      ...(imageUrl ? { image_url: imageUrl } : {}),
      ...(data.notification_id ? { notification_id: String(data.notification_id) } : {}),
      ...(campaignId ? { campaign_id: String(campaignId) } : {}),
      ...optional,
    },
    android: {
      priority: "high",
      notification: {
        channelId: "reward_planners_general",
        sound: "default",
        defaultSound: true,
        vibrateTimingsMillis: [0, 1000, 500, 1000, 500],
        ...(imageUrl ? { imageUrl } : {}),
      },
    },
    apns: {
      payload: { aps: { sound: "default", ...(imageUrl ? { "mutable-content": 1 } : {}) } },
      ...(imageUrl ? { fcmOptions: { imageUrl } } : {}),
    },
    token: fcmToken,
  };
}

module.exports = {
  buildNotificationPayload,
  buildPushMessage,
  buildWindowedIdempotencyKey,
  IMAGE_HOSTS,
  inferScreen,
  safeImageUrl,
  SCREEN_BY_MODULE,
};
