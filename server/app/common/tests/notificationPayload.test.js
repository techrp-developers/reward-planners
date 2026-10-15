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
  assert.match(payload.idempotency_key, /^window:[a-f0-9]{64}$/);
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

test("an explicit daily idempotency key is preserved", () => {
  const payload = buildNotificationPayload({
    userId: 7,
    module: "fitness",
    type: "fitness_midday_hook",
    title: "Let's get moving!",
    message: "Keep walking.",
    reference_type: "fitness_goal",
    reference_id: "midday_hook",
    idempotency_key: "fitness:midday:7:2026-09-21",
  });

  assert.equal(payload.idempotency_key, "fitness:midday:7:2026-09-21");
});

test("matching ordinary pushes in the same window get the same key", () => {
  const input = {
    userId: 7,
    module: "ecommerce",
    type: "cart_message",
    title: "Cart reminder",
    message: "Your cart is waiting.",
    reference_type: "cart",
    reference_id: "7",
  };

  const first = buildNotificationPayload(input);
  const second = buildNotificationPayload(input);
  assert.equal(first.idempotency_key, second.idempotency_key);
});
