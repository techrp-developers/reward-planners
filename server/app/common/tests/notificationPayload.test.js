const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildNotificationPayload,
  buildPushMessage,
} = require("../utils/notificationPayload");

test("mobile screen is inferred without changing the existing action URL", () => {
  const payload = buildNotificationPayload({
    userId: 7,
    module: "ecommerce",
    type: "order_paid",
    title: "Order confirmed",
    message: "Your order is confirmed.",
    reference_type: "order",
    reference_id: 42,
    action_url: "/orders/order-details/42",
  });

  assert.equal(payload.screen, "OrderDetails");
  assert.equal(payload.action_url, "/orders/order-details/42");
  assert.equal(payload.idempotency_key, "7:ecommerce:order_paid:42");
});

test("explicit mobile screen takes precedence", () => {
  const payload = buildNotificationPayload({
    userId: 7,
    module: "todo",
    type: "todo_reminder",
    title: "Reminder",
    message: "Task starts soon.",
    screen: "CustomTodoScreen",
  });

  assert.equal(payload.screen, "CustomTodoScreen");
  assert.equal(payload.idempotency_key, undefined);
});

test("FCM data payload contains strings only", () => {
  const message = buildPushMessage({
    module: "bbps",
    type: "bbps_payment_success",
    title: "Paid",
    message: "Payment complete.",
    reference_type: "bbps_transaction",
    reference_id: 99,
    screen: "BbpsHome",
    priority: "high",
  }, "token-1");

  assert.equal(message.token, "token-1");
  assert.equal(message.data.reference_id, "99");
  assert.ok(Object.values(message.data).every((value) => typeof value === "string"));
});
