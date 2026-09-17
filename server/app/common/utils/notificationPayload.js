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

module.exports = { buildNotificationPayload, buildPushMessage, inferScreen };
