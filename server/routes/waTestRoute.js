const express = require("express");
const router = express.Router();
const db = require("../config/database");
const { enqueueWhatsApp } = require("../services/whatsapp/waEnqueueService");
const { sendBirthdayWishes } = require("../services/Todo/birthdayReminderCron");
const { sendPushNotification } = require("../app/common/utils/notification");

const sharedPushModules = [
  "auth/common",
  "todo",
  "birthday",
  "ecommerce",
  "service",
  "bbps",
  "fitness",
  "games",
  "support",
  "shipment",
];

const notificationTypeFactories = {
  todo_15min: () => ({
    module: "todo",
    type: "todo_reminder",
    title: "Upcoming Task: Review Project Code",
    message: "Starts in 15 minutes at 10:30 AM!",
    icon: "clock",
    reference_type: "todo",
    reference_id: "test_todo_1",
    action_url: "/todo",
  }),
  todo_custom: () => ({
    module: "todo",
    type: "todo_reminder",
    title: "Reminder: Review Project Code",
    message: "Starts at 10:30 AM!",
    icon: "clock",
    reference_type: "todo",
    reference_id: "test_todo_2",
    action_url: "/todo",
  }),
  birthday: () => ({
    module: "todo",
    type: "birthday_wish",
    title: "Happy Birthday, Valued Team Member!",
    message: "Wishing you a fantastic day filled with joy and success! - Reward Planners",
    icon: "gift",
    reference_type: "birthday",
    reference_id: "test_bday_1",
    action_url: "/profile",
  }),
  order_confirmed: () => ({
    module: "ecommerce",
    type: "order_confirmed",
    title: "Order Confirmed!",
    message: "Thank you! Order #98765 has been placed. We are preparing it for shipment.",
    icon: "check-circle",
    reference_type: "order",
    reference_id: "98765",
    action_url: "/orders/order-details/98765",
  }),
  order_dispatched: () => ({
    module: "ecommerce",
    type: "order_dispatched",
    title: "Your order is on the way!",
    message: "Order #98765 has been shipped! Track it using ID: EB12345678.",
    icon: "truck",
    reference_type: "order",
    reference_id: "98765",
    action_url: "/orders/order-details/98765",
  }),
  order_out_for_delivery: () => ({
    module: "ecommerce",
    type: "order_out_for_delivery",
    title: "Out for delivery today",
    message: "Your package #98765 is out for delivery with our executive today.",
    icon: "truck",
    reference_type: "order",
    reference_id: "98765",
    action_url: "/orders/order-details/98765",
  }),
  order_delivered: () => ({
    module: "ecommerce",
    type: "order_delivered",
    title: "Delivered!",
    message: "Your package #98765 has been successfully delivered. Hope you love it!",
    icon: "gift",
    reference_type: "order",
    reference_id: "98765",
    action_url: "/orders/order-details/98765",
  }),
  order_rto: () => ({
    module: "ecommerce",
    type: "order_rto",
    title: "Order returned",
    message: "Your order #98765 could not be delivered and is being returned.",
    icon: "alert-triangle",
    reference_type: "order",
    reference_id: "98765",
    action_url: "/orders/order-details/98765",
  }),
  order_ndr: () => ({
    module: "ecommerce",
    type: "order_ndr",
    title: "Delivery failed",
    message: "We couldn't deliver your order #98765. Please update your details to retry.",
    icon: "x-circle",
    reference_type: "order",
    reference_id: "98765",
    action_url: "/orders/order-details/98765",
  }),
  coins_credited: () => ({
    module: "wallet",
    type: "coins_credited",
    title: "Coins Credited!",
    message: "You earned 150 Reward Coins from your purchase! Check your wallet.",
    icon: "wallet",
    reference_type: "wallet",
    reference_id: "coins_150",
    action_url: "/wallet",
  }),
  checkout_abandonment_eco: () => ({
    module: "ecommerce",
    type: "payment_abandoned",
    title: "Payment incomplete",
    message: "Your e-commerce order is waiting! Complete your payment of Rs. 1,500 now.",
    icon: "credit-card",
    reference_type: "razorpay_order",
    reference_id: "order_mock_eco123",
    action_url: "/orders",
  }),
  checkout_abandonment_srv: () => ({
    module: "service",
    type: "payment_abandoned",
    title: "Service order pending",
    message: "Finish your service order of Rs. 3,500 to let our experts start working.",
    icon: "credit-card",
    reference_type: "razorpay_order",
    reference_id: "order_mock_srv456",
    action_url: "/orders",
  }),
  checkout_abandonment_bbps: () => ({
    module: "bbps",
    type: "payment_abandoned",
    title: "Utility bill payment pending",
    message: "Your bill payment of Rs. 850 was not finished. Tap here to complete it.",
    icon: "credit-card",
    reference_type: "razorpay_order",
    reference_id: "order_mock_bbp789",
    action_url: "/orders",
  }),
  cart_abandonment: () => ({
    module: "ecommerce",
    type: "cart_abandonment",
    title: "Did you forget something?",
    message: "Your cart is waiting! Complete your checkout now and secure your rewards.",
    icon: "shopping-cart",
    reference_type: "cart",
    reference_id: "cart_abandon",
    action_url: "/cart",
  }),
  price_drop: () => ({
    module: "ecommerce",
    type: "cart_price_drop",
    title: "Price Drop!",
    message: "An item in your cart, Premium Smartwatch, is now cheaper! Tap to order now.",
    icon: "trending-down",
    reference_type: "product_variant",
    reference_id: "variant_watch_1",
    action_url: "/cart",
  }),
  low_stock: () => ({
    module: "ecommerce",
    type: "cart_low_stock",
    title: "Almost gone!",
    message: "Hurry! The Premium Smartwatch in your cart is selling fast. Only 2 left!",
    icon: "alert-triangle",
    reference_type: "product_variant",
    reference_id: "variant_watch_1",
    action_url: "/cart",
  }),
  service_confirmed: () => ({
    module: "service",
    type: "service_confirmed",
    title: "Service order confirmed",
    message: "Your order for GST Return Filing is confirmed and we are ready to begin.",
    icon: "briefcase",
    reference_type: "service_order",
    reference_id: "order_srv_1",
    action_url: "/orders/order-details/order_srv_1",
  }),
  service_docs_pending: () => ({
    module: "service",
    type: "service_docs_pending",
    title: "Action Required: Documents pending",
    message: "We found an issue with your documents for GST Return Filing. Tap to review and re-upload.",
    icon: "file-text",
    reference_type: "service_order",
    reference_id: "order_srv_1",
    action_url: "/orders/order-details/order_srv_1",
  }),
  service_docs_submitted: () => ({
    module: "service",
    type: "service_docs_submitted",
    title: "Documents submitted successfully",
    message: "We have received your documents for GST Return Filing and our team is on it.",
    icon: "check-circle",
    reference_type: "service_order",
    reference_id: "order_srv_1",
    action_url: "/orders/order-details/order_srv_1",
  }),
  service_status_updated: () => ({
    module: "service",
    type: "service_status_updated",
    title: "Service status updated",
    message: "Your order for GST Return Filing has been updated to: in_progress.",
    icon: "activity",
    reference_type: "service_order",
    reference_id: "order_srv_1",
    action_url: "/orders/order-details/order_srv_1",
  }),
  service_enquiry: () => ({
    module: "service",
    type: "service_enquiry_submitted",
    title: "Enquiry submitted",
    message: "Your service enquiry has been submitted. Our team will contact you soon.",
    icon: "help-circle",
    reference_type: "service_enquiry",
    reference_id: "enq_1",
    action_url: "/services",
  }),
  service_cart_abandon: () => ({
    module: "service",
    type: "service_cart_abandon",
    title: "Complete your service request!",
    message: "You have service items left in your cart. Let our experts assist you today!",
    icon: "briefcase",
    reference_type: "service_cart",
    reference_id: "service_cart_abandon",
    action_url: "/cart",
  }),
  service_bundle_upsell: () => ({
    module: "service",
    type: "service_bundle_upsell",
    title: "Get the complete package!",
    message: "Save by adding Income Tax Return to complete your Corporate Setup pack!",
    icon: "gift",
    reference_type: "service_bundle",
    reference_id: "bundle_corp_1",
    action_url: "/services",
  }),
  service_missing_docs: () => ({
    module: "service",
    type: "service_missing_docs",
    title: "Urgent: Upload Documents",
    message: "We need your documents to begin work on GST Return Filing. Tap to upload now.",
    icon: "alert-circle",
    reference_type: "service_order",
    reference_id: "order_srv_1",
    action_url: "/orders/order-details/order_srv_1",
  }),
  bill_due: () => ({
    module: "bbps",
    type: "bbps_bill_due",
    title: "Bill Due Alert",
    message: "Your electricity/gas bill is due soon. Pay via Reward Planners and earn double coins!",
    icon: "zap",
    reference_type: "bbps_bill",
    reference_id: "bill_fetch_1",
    action_url: "/bbps",
  }),
  recharge_reminder: () => ({
    module: "bbps",
    type: "bbps_recharge_reminder",
    title: "Prepaid Plan Expiring",
    message: "Time to recharge! Keep your calls and data active. Click here to recharge in 1 tap.",
    icon: "smartphone",
    reference_type: "bbps_transaction",
    reference_id: "txn_recharge_1",
    action_url: "/bbps",
  }),
  bbps_success: () => ({
    module: "bbps",
    type: "bbps_payment_success",
    title: "Payment Successful!",
    message: "Your payment of Rs. 850.00 for Tata Power was processed. A receipt has been generated.",
    icon: "receipt",
    reference_type: "bbps_transaction",
    reference_id: "txn_recharge_1",
    action_url: "/bbps",
  }),
  fitness_midday: () => ({
    module: "fitness",
    type: "fitness_midday_hook",
    title: "Let's get moving!",
    message: "You've walked 1200 steps today. Take a quick stroll to hit your daily goal!",
    icon: "footprints",
    reference_type: "fitness_goal",
    reference_id: "midday_hook",
    action_url: "/fitness",
  }),
  fitness_almost: () => ({
    module: "fitness",
    type: "fitness_almost_completed",
    title: "Almost there!",
    message: "Only 1500 steps left to achieve your daily target. You can do it!",
    icon: "award",
    reference_type: "fitness_goal",
    reference_id: "almost_completed",
    action_url: "/fitness",
  }),
  fitness_goal_achieved: () => ({
    module: "fitness",
    type: "fitness_reward_earned",
    title: "Daily Goal Achieved!",
    message: "Incredible job! You reached your step target and earned 50 Reward Coins!",
    icon: "footprints",
    reference_type: "fitness_reward",
    reference_id: "fit_reward_1",
    action_url: "/fitness/wallet",
  }),
};

function getNotificationPayload(type) {
  const factory = notificationTypeFactories[type];
  return factory ? factory() : null;
}

function getNotificationTypeList() {
  return Object.entries(notificationTypeFactories).map(([key, factory]) => {
    const payload = factory();
    return {
      key,
      module: payload.module,
      type: payload.type,
      title: payload.title,
    };
  });
}

// POST /api/wa/test
// Supports both payload styles:
// A) { eventName, phone, company_id, order_id, otp, ... }
// B) { eventName, ctx: { phone, company_id, order_id, otp, ... } }
router.post("/test", async (req, res) => {
  try {
    const { eventName, phone, ctx, ...rest } = req.body || {};

    if (!eventName || typeof eventName !== "string") {
      return res.status(400).json({
        ok: false,
        error: "eventName is required and must be a string",
      });
    }

    // Merge ctx (if provided) + legacy params (phone/rest)
    // Priority: explicit phone field > ctx.phone
    const mergedCtx = {
      ...(ctx && typeof ctx === "object" ? ctx : {}),
      ...rest,
    };

    if (phone != null) mergedCtx.phone = phone;

    if (!mergedCtx.phone || typeof mergedCtx.phone !== "string") {
      return res.status(400).json({
        ok: false,
        error: "phone is required (string). Send `phone` or `ctx.phone`",
      });
    }

    // OPTIONAL: If you want to force company_id always
    // if (!mergedCtx.company_id) {
    //   return res.status(400).json({ ok: false, error: "company_id is required" });
    // }

    const result = await enqueueWhatsApp({
      eventName,
      ctx: mergedCtx,
    });

    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e?.message || e),
    });
  }
});

router.get("/test-birthday", async (req, res) => {
  try {
    await sendBirthdayWishes();
    return res.json({ ok: true, message: "Birthday wishes check triggered!" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/notification-health/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const sendTest = String(req.query.sendTest || "").toLowerCase() === "true";

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Valid userId is required",
      });
    }

    const [[user]] = await db.query(
      `
      SELECT user_id, name, email, fcm_token, last_login_at
      FROM customer
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "User not found",
      });
    }

    const [recentNotifications] = await db.query(
      `
      SELECT
        notification_id,
        module,
        type,
        title,
        message,
        is_read,
        created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY notification_id DESC
      LIMIT 20
      `,
      [userId]
    );

    const [notificationCounts] = await db.query(
      `
      SELECT module, COUNT(*) AS total
      FROM notifications
      WHERE user_id = ?
      GROUP BY module
      ORDER BY total DESC, module ASC
      `,
      [userId]
    );

    const [todoReminderRows] = await db.query(
      `
      SELECT
        id,
        todo_id,
        reminder_type,
        reminder_label,
        scheduled_for,
        status,
        attempt_count,
        sent_at,
        last_error,
        updated_at
      FROM todo_reminders
      WHERE user_id = ?
      ORDER BY scheduled_for DESC, id DESC
      LIMIT 20
      `,
      [userId]
    );

    let testPushResult = null;

    if (sendTest) {
      testPushResult = await sendPushNotification({
        userId,
        module: "system",
        type: "health_check",
        title: "Push health check",
        message: "This is a live push notification health check from Reward Planners backend.",
        icon: "activity",
        reference_type: "health_check",
        reference_id: String(userId),
        action_url: "/",
        screen: "Dashboard",
      });
    }

    return res.json({
      ok: true,
      currentDate: "2026-08-05",
      sharedPushModules,
      user: {
        userId: user.user_id,
        name: user.name,
        email: user.email,
        hasFcmToken: Boolean(user.fcm_token),
        fcmTokenPreview: user.fcm_token
          ? `${String(user.fcm_token).slice(0, 16)}...`
          : null,
        lastLoginAt: user.last_login_at,
      },
      notificationCounts,
      recentNotifications,
      todoReminders: todoReminderRows,
      testPushResult,
      assessment: {
        sharedPathReady: true,
        canAttemptPushNow: Boolean(user.fcm_token),
        note: user.fcm_token
          ? "Backend is structurally ready to send push notifications for all modules that call notifyUser."
          : "No FCM token is stored for this user, so push delivery cannot work until the app updates the token.",
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
});

router.get("/notification-types", async (req, res) => {
  try {
    return res.json({
      ok: true,
      count: Object.keys(notificationTypeFactories).length,
      types: getNotificationTypeList(),
      usage: {
        list: "/api/wa/notification-types",
        trigger: "/api/wa/notification-trigger/:userId?type=order_confirmed",
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
});

router.all("/notification-trigger/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const type = req.body?.type || req.query?.type;
    const { notifyUser } = require("../app/common/utils/notification");

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Valid userId is required",
      });
    }

    if (!type || typeof type !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Notification type is required",
        availableTypes: Object.keys(notificationTypeFactories),
      });
    }

    const payload = getNotificationPayload(type);

    if (!payload) {
      return res.status(400).json({
        ok: false,
        error: "Invalid notification type",
        availableTypes: Object.keys(notificationTypeFactories),
      });
    }

    notifyUser(
      {
        userId,
        ...payload,
      },
      `notification trigger: ${type}`,
    );

    return res.json({
      ok: true,
      message: `Notification ${type} triggered successfully`,
      userId,
      payload,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
});

router.get("/test-ecommerce/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { notifyUser } = require("../app/common/utils/notification");

    // 1. Send Order Paid Notification
    notifyUser({
      userId,
      module: "ecommerce",
      type: "order_paid",
      title: "Order confirmed 🛍️",
      message: "Your e-commerce test order is confirmed and being processed.",
      icon: "shopping-bag",
      reference_type: "order",
      reference_id: 9999,
      action_url: "/orders/order-details/9999",
    }, "test order paid");

    // 2. Send Coins Earned Notification
    notifyUser({
      userId,
      module: "wallet",
      type: "order_reward_earned",
      title: "Coins earned 🪙",
      message: "You earned 150 reward coins from your test order.",
      icon: "wallet",
      reference_type: "order",
      reference_id: 9999,
      action_url: "/wallet",
    }, "test order coins");

    // 3. Send Shipped Notification
    notifyUser({
      userId,
      module: "ecommerce",
      type: "shipped",
      title: "Order shipped 🚚",
      message: "Your package is on the way. Tracking AWB: AWB123456",
      icon: "truck",
      reference_type: "order",
      reference_id: 9999,
      action_url: "/orders/order-details/9999",
    }, "test order shipped");

    return res.json({ ok: true, message: "E-Commerce test notifications triggered!" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/test-abandonment/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { notifyUser } = require("../app/common/utils/notification");

    // 1. Mock E-Commerce Checkout Abandonment
    notifyUser({
      userId,
      module: "ecommerce",
      type: "payment_abandoned",
      title: "Payment incomplete 🛍️",
      message: "Your e-commerce order is waiting! Complete your payment of Rs. 1,500 now.",
      icon: "credit-card",
      reference_type: "razorpay_order",
      reference_id: "order_mock_eco123",
      action_url: "/orders",
    }, "test ecommerce checkout abandonment");

    // 2. Mock Service Checkout Abandonment
    notifyUser({
      userId,
      module: "service",
      type: "payment_abandoned",
      title: "Service order pending 💼",
      message: "Finish your service order of Rs. 3,500 to let our experts start working.",
      icon: "credit-card",
      reference_type: "razorpay_order",
      reference_id: "order_mock_srv456",
      action_url: "/orders",
    }, "test service checkout abandonment");

    // 3. Mock BBPS Bill Payment Abandonment
    notifyUser({
      userId,
      module: "bbps",
      type: "payment_abandoned",
      title: "Utility bill payment pending ⚡",
      message: "Your bill payment of Rs. 850 was not finished. Tap here to complete it.",
      icon: "credit-card",
      reference_type: "razorpay_order",
      reference_id: "order_mock_bbp789",
      action_url: "/orders",
    }, "test bbps checkout abandonment");

    return res.json({ ok: true, message: "Checkout abandonment test notifications triggered!" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/test-todo/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { notifyUser } = require("../app/common/utils/notification");

    notifyUser({
      userId,
      module: "todo",
      type: "todo_reminder",
      title: "Upcoming Task: Test Alarm Sound ⏰",
      message: "This is a test notification to listen to the alert sound and feel the 3-second vibration!",
      icon: "clock",
      reference_type: "todo",
      reference_id: "mock_todo_id",
      action_url: "/todo",
    }, "test todo reminder alert sound");

    return res.json({ ok: true, message: "Todo alert sound test notification triggered!" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/test-all/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { notifyUser } = require("../app/common/utils/notification");

    // 1. Todo Reminder
    notifyUser({
      userId,
      module: "todo",
      type: "todo_reminder",
      title: "Upcoming Task: Review Project Code ⏰",
      message: "Starts in 15 minutes at 10:30 AM!",
      icon: "clock",
      reference_type: "todo",
      reference_id: "test_todo_1",
      action_url: "/todo",
    }, "test todo");

    // 2. Birthday Wishes
    notifyUser({
      userId,
      module: "todo",
      type: "birthday_wish",
      title: "Happy Birthday, Valued Team Member! 🎂",
      message: "Wishing you a fantastic day filled with joy and success! 🎉 - Reward Planners",
      icon: "gift",
      reference_type: "birthday",
      reference_id: "test_bday_1",
      action_url: "/profile",
    }, "test birthday");

    // 3. E-Commerce Order success / status transitions
    notifyUser({
      userId,
      module: "ecommerce",
      type: "order_confirmed",
      title: "Order Confirmed! 📦",
      message: "Thank you! Order #98765 has been placed. We are preparing it for shipment.",
      icon: "check-circle",
      reference_type: "order",
      reference_id: "98765",
      action_url: "/orders/order-details/98765",
    }, "test order confirmed");

    notifyUser({
      userId,
      module: "ecommerce",
      type: "order_dispatched",
      title: "Your order is on the way! 🚚",
      message: "Order #98765 has been shipped! Track it using ID: EB12345678.",
      icon: "truck",
      reference_type: "order",
      reference_id: "98765",
      action_url: "/orders/order-details/98765",
    }, "test order dispatched");

    notifyUser({
      userId,
      module: "ecommerce",
      type: "order_out_for_delivery",
      title: "Out for delivery today 🛵",
      message: "Your package #98765 is out for delivery with our executive today.",
      icon: "truck",
      reference_type: "order",
      reference_id: "98765",
      action_url: "/orders/order-details/98765",
    }, "test order out for delivery");

    notifyUser({
      userId,
      module: "ecommerce",
      type: "order_delivered",
      title: "Delivered! 🎉",
      message: "Your package #98765 has been successfully delivered. Hope you love it!",
      icon: "gift",
      reference_type: "order",
      reference_id: "98765",
      action_url: "/orders/order-details/98765",
    }, "test order delivered");

    notifyUser({
      userId,
      module: "ecommerce",
      type: "order_rto",
      title: "Order returned ⚠️",
      message: "Your order #98765 could not be delivered and is being returned.",
      icon: "alert-triangle",
      reference_type: "order",
      reference_id: "98765",
      action_url: "/orders/order-details/98765",
    }, "test order rto");

    notifyUser({
      userId,
      module: "ecommerce",
      type: "order_ndr",
      title: "Delivery failed ⚠️",
      message: "We couldn't deliver your order #98765. Please update your details to retry.",
      icon: "x-circle",
      reference_type: "order",
      reference_id: "98765",
      action_url: "/orders/order-details/98765",
    }, "test order ndr");

    notifyUser({
      userId,
      module: "wallet",
      type: "coins_credited",
      title: "Coins Credited! 🪙",
      message: "You earned 150 Reward Coins from your purchase! Check your wallet.",
      icon: "wallet",
      reference_type: "wallet",
      reference_id: "coins_150",
      action_url: "/wallet",
    }, "test coins credited");

    // 4. E-Commerce Cart Recovery (Part B)
    notifyUser({
      userId,
      module: "ecommerce",
      type: "cart_abandonment",
      title: "Did you forget something? 🛒",
      message: "Your cart is waiting! Complete your checkout now and secure your rewards.",
      icon: "shopping-cart",
      reference_type: "cart",
      reference_id: "cart_abandon",
      action_url: "/cart",
    }, "test cart abandonment");

    notifyUser({
      userId,
      module: "ecommerce",
      type: "cart_price_drop",
      title: "Price Drop! 💸",
      message: "An item in your cart, Premium Smartwatch, is now cheaper! Tap to order now.",
      icon: "trending-down",
      reference_type: "product_variant",
      reference_id: "variant_watch_1",
      action_url: "/cart",
    }, "test price drop");

    notifyUser({
      userId,
      module: "ecommerce",
      type: "cart_low_stock",
      title: "Almost gone! ⏳",
      message: "Hurry! The Premium Smartwatch in your cart is selling fast. Only 2 left!",
      icon: "alert-triangle",
      reference_type: "product_variant",
      reference_id: "variant_watch_1",
      action_url: "/cart",
    }, "test low stock");

    // 5. Services general progress
    notifyUser({
      userId,
      module: "service",
      type: "service_confirmed",
      title: "Service order confirmed 💼",
      message: "Your order for GST Return Filing is confirmed and we are ready to begin.",
      icon: "briefcase",
      reference_type: "service_order",
      reference_id: "order_srv_1",
      action_url: "/orders/order-details/order_srv_1",
    }, "test service confirmed");

    notifyUser({
      userId,
      module: "service",
      type: "service_docs_pending",
      title: "Action Required: Documents pending 📄",
      message: "We found an issue with your documents for GST Return Filing. Tap to review and re-upload.",
      icon: "file-text",
      reference_type: "service_order",
      reference_id: "order_srv_1",
      action_url: "/orders/order-details/order_srv_1",
    }, "test service docs pending");

    notifyUser({
      userId,
      module: "service",
      type: "service_docs_submitted",
      title: "Documents submitted successfully ✅",
      message: "We have received your documents for GST Return Filing and our team is on it.",
      icon: "check-circle",
      reference_type: "service_order",
      reference_id: "order_srv_1",
      action_url: "/orders/order-details/order_srv_1",
    }, "test service docs submitted");

    notifyUser({
      userId,
      module: "service",
      type: "service_status_updated",
      title: "Service status updated ⚡",
      message: "Your order for GST Return Filing has been updated to: in_progress.",
      icon: "activity",
      reference_type: "service_order",
      reference_id: "order_srv_1",
      action_url: "/orders/order-details/order_srv_1",
    }, "test service status update");

    notifyUser({
      userId,
      module: "service",
      type: "service_enquiry_submitted",
      title: "Enquiry submitted 💬",
      message: "Your service enquiry has been submitted. Our team will contact you soon.",
      icon: "help-circle",
      reference_type: "service_enquiry",
      reference_id: "enq_1",
      action_url: "/services",
    }, "test service enquiry");

    // 6. Services Cart & Documents (Part B)
    notifyUser({
      userId,
      module: "service",
      type: "service_cart_abandon",
      title: "Complete your service request! 💼",
      message: "You have service items left in your cart. Let our experts assist you today!",
      icon: "briefcase",
      reference_type: "service_cart",
      reference_id: "service_cart_abandon",
      action_url: "/cart",
    }, "test service cart abandon");

    notifyUser({
      userId,
      module: "service",
      type: "service_bundle_upsell",
      title: "Get the complete package! 📦",
      message: "Save by adding Income Tax Return to complete your Corporate Setup pack!",
      icon: "gift",
      reference_type: "service_bundle",
      reference_id: "bundle_corp_1",
      action_url: "/services",
    }, "test service bundle upsell");

    notifyUser({
      userId,
      module: "service",
      type: "service_missing_docs",
      title: "Urgent: Upload Documents 📄",
      message: "We need your documents to begin work on GST Return Filing. Tap to upload now.",
      icon: "alert-circle",
      reference_type: "service_order",
      reference_id: "order_srv_1",
      action_url: "/orders/order-details/order_srv_1",
    }, "test service missing docs");

    // 7. BBPS (Part B)
    notifyUser({
      userId,
      module: "bbps",
      type: "bbps_bill_due",
      title: "Bill Due Alert ⚡",
      message: "Your electricity/gas bill is due soon. Pay via Reward Planners and earn double coins!",
      icon: "zap",
      reference_type: "bbps_bill",
      reference_id: "bill_fetch_1",
      action_url: "/bbps",
    }, "test bbps bill due");

    notifyUser({
      userId,
      module: "bbps",
      type: "bbps_recharge_reminder",
      title: "Prepaid Plan Expiring 📱",
      message: "Time to recharge! Keep your calls and data active. Click here to recharge in 1 tap.",
      icon: "smartphone",
      reference_type: "bbps_transaction",
      reference_id: "txn_recharge_1",
      action_url: "/bbps",
    }, "test bbps recharge");

    notifyUser({
      userId,
      module: "bbps",
      type: "bbps_payment_success",
      title: "Payment Successful! ✅",
      message: "Your payment of Rs. 850.00 for Tata Power was processed. A receipt has been generated.",
      icon: "receipt",
      reference_type: "bbps_transaction",
      reference_id: "txn_recharge_1",
      action_url: "/bbps",
    }, "test bbps success");

    // 8. Step Counter (Part B)
    notifyUser({
      userId,
      module: "fitness",
      type: "fitness_midday_hook",
      title: "Let's get moving! 🚶‍♂️",
      message: "You've walked 1200 steps today. Take a quick stroll to hit your daily goal!",
      icon: "footprints",
      reference_type: "fitness_goal",
      reference_id: "midday_hook",
      action_url: "/fitness",
    }, "test fitness midday");

    notifyUser({
      userId,
      module: "fitness",
      type: "fitness_almost_completed",
      title: "Almost there! 🏁",
      message: "Only 1500 steps left to achieve your daily target. You can do it!",
      icon: "award",
      reference_type: "fitness_goal",
      reference_id: "almost_completed",
      action_url: "/fitness",
    }, "test fitness almost completed");

    notifyUser({
      userId,
      module: "fitness",
      type: "fitness_reward_earned",
      title: "Daily Goal Achieved! 🎉",
      message: "Incredible job! You reached your step target and earned 50 Reward Coins!",
      icon: "footprints",
      reference_type: "fitness_reward",
      reference_id: "fit_reward_1",
      action_url: "/fitness/wallet",
    }, "test fitness reward earned");

    return res.json({ ok: true, message: "All push notification test variants triggered successfully!" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/test-single/:userId/:type", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const type = req.params.type;
    const { notifyUser } = require("../app/common/utils/notification");

    let payload = null;

    switch(type) {
      case "todo_15min":
        payload = {
          module: "todo",
          type: "todo_reminder",
          title: "Upcoming Task: Review Project Code ⏰",
          message: "Starts in 15 minutes at 10:30 AM!",
          icon: "clock",
          reference_type: "todo",
          reference_id: "test_todo_1",
          action_url: "/todo",
        };
        break;
      case "todo_custom":
        payload = {
          module: "todo",
          type: "todo_reminder",
          title: "Reminder: Review Project Code ⏰",
          message: "Starts at 10:30 AM!",
          icon: "clock",
          reference_type: "todo",
          reference_id: "test_todo_2",
          action_url: "/todo",
        };
        break;
      case "birthday":
        payload = {
          module: "todo",
          type: "birthday_wish",
          title: "Happy Birthday, Valued Team Member! 🎂",
          message: "Wishing you a fantastic day filled with joy and success! 🎉 - Reward Planners",
          icon: "gift",
          reference_type: "birthday",
          reference_id: "test_bday_1",
          action_url: "/profile",
        };
        break;
      case "order_confirmed":
        payload = {
          module: "ecommerce",
          type: "order_confirmed",
          title: "Order Confirmed! 📦",
          message: "Thank you! Order #98765 has been placed. We are preparing it for shipment.",
          icon: "check-circle",
          reference_type: "order",
          reference_id: "98765",
          action_url: "/orders/order-details/98765",
        };
        break;
      case "order_dispatched":
        payload = {
          module: "ecommerce",
          type: "order_dispatched",
          title: "Your order is on the way! 🚚",
          message: "Order #98765 has been shipped! Track it using ID: EB12345678.",
          icon: "truck",
          reference_type: "order",
          reference_id: "98765",
          action_url: "/orders/order-details/98765",
        };
        break;
      case "order_out_for_delivery":
        payload = {
          module: "ecommerce",
          type: "order_out_for_delivery",
          title: "Out for delivery today 🛵",
          message: "Your package #98765 is out for delivery with our executive today.",
          icon: "truck",
          reference_type: "order",
          reference_id: "98765",
          action_url: "/orders/order-details/98765",
        };
        break;
      case "order_delivered":
        payload = {
          module: "ecommerce",
          type: "order_delivered",
          title: "Delivered! 🎉",
          message: "Your package #98765 has been successfully delivered. Hope you love it!",
          icon: "gift",
          reference_type: "order",
          reference_id: "98765",
          action_url: "/orders/order-details/98765",
        };
        break;
      case "order_rto":
        payload = {
          module: "ecommerce",
          type: "order_rto",
          title: "Order returned ⚠️",
          message: "Your order #98765 could not be delivered and is being returned.",
          icon: "alert-triangle",
          reference_type: "order",
          reference_id: "98765",
          action_url: "/orders/order-details/98765",
        };
        break;
      case "order_ndr":
        payload = {
          module: "ecommerce",
          type: "order_ndr",
          title: "Delivery failed ⚠️",
          message: "We couldn't deliver your order #98765. Please update your details to retry.",
          icon: "x-circle",
          reference_type: "order",
          reference_id: "98765",
          action_url: "/orders/order-details/98765",
        };
        break;
      case "coins_credited":
        payload = {
          module: "wallet",
          type: "coins_credited",
          title: "Coins Credited! 🪙",
          message: "You earned 150 Reward Coins from your purchase! Check your wallet.",
          icon: "wallet",
          reference_type: "wallet",
          reference_id: "coins_150",
          action_url: "/wallet",
        };
        break;
      case "checkout_abandonment_eco":
        payload = {
          module: "ecommerce",
          type: "payment_abandoned",
          title: "Payment incomplete 🛍️",
          message: "Your e-commerce order is waiting! Complete your payment of Rs. 1,500 now.",
          icon: "credit-card",
          reference_type: "razorpay_order",
          reference_id: "order_mock_eco123",
          action_url: "/orders",
        };
        break;
      case "checkout_abandonment_srv":
        payload = {
          module: "service",
          type: "payment_abandoned",
          title: "Service order pending 💼",
          message: "Finish your service order of Rs. 3,500 to let our experts start working.",
          icon: "credit-card",
          reference_type: "razorpay_order",
          reference_id: "order_mock_srv456",
          action_url: "/orders",
        };
        break;
      case "checkout_abandonment_bbps":
        payload = {
          module: "bbps",
          type: "payment_abandoned",
          title: "Utility bill payment pending ⚡",
          message: "Your bill payment of Rs. 850 was not finished. Tap here to complete it.",
          icon: "credit-card",
          reference_type: "razorpay_order",
          reference_id: "order_mock_bbp789",
          action_url: "/orders",
        };
        break;
      case "cart_abandonment":
        payload = {
          module: "ecommerce",
          type: "cart_abandonment",
          title: "Did you forget something? 🛒",
          message: "Your cart is waiting! Complete your checkout now and secure your rewards.",
          icon: "shopping-cart",
          reference_type: "cart",
          reference_id: "cart_abandon",
          action_url: "/cart",
        };
        break;
      case "price_drop":
        payload = {
          module: "ecommerce",
          type: "cart_price_drop",
          title: "Price Drop! 💸",
          message: "An item in your cart, Premium Smartwatch, is now cheaper! Tap to order now.",
          icon: "trending-down",
          reference_type: "product_variant",
          reference_id: "variant_watch_1",
          action_url: "/cart",
        };
        break;
      case "low_stock":
        payload = {
          module: "ecommerce",
          type: "cart_low_stock",
          title: "Almost gone! ⏳",
          message: "Hurry! The Premium Smartwatch in your cart is selling fast. Only 2 left!",
          icon: "alert-triangle",
          reference_type: "product_variant",
          reference_id: "variant_watch_1",
          action_url: "/cart",
        };
        break;
      case "service_confirmed":
        payload = {
          module: "service",
          type: "service_confirmed",
          title: "Service order confirmed 💼",
          message: "Your order for GST Return Filing is confirmed and we are ready to begin.",
          icon: "briefcase",
          reference_type: "service_order",
          reference_id: "order_srv_1",
          action_url: "/orders/order-details/order_srv_1",
        };
        break;
      case "service_docs_pending":
        payload = {
          module: "service",
          type: "service_docs_pending",
          title: "Action Required: Documents pending 📄",
          message: "We found an issue with your documents for GST Return Filing. Tap to review and re-upload.",
          icon: "file-text",
          reference_type: "service_order",
          reference_id: "order_srv_1",
          action_url: "/orders/order-details/order_srv_1",
        };
        break;
      case "service_docs_submitted":
        payload = {
          module: "service",
          type: "service_docs_submitted",
          title: "Documents submitted successfully ✅",
          message: "We have received your documents for GST Return Filing and our team is on it.",
          icon: "check-circle",
          reference_type: "service_order",
          reference_id: "order_srv_1",
          action_url: "/orders/order-details/order_srv_1",
        };
        break;
      case "service_status_updated":
        payload = {
          module: "service",
          type: "service_status_updated",
          title: "Service status updated ⚡",
          message: "Your order for GST Return Filing has been updated to: in_progress.",
          icon: "activity",
          reference_type: "service_order",
          reference_id: "order_srv_1",
          action_url: "/orders/order-details/order_srv_1",
        };
        break;
      case "service_enquiry":
        payload = {
          module: "service",
          type: "service_enquiry_submitted",
          title: "Enquiry submitted 💬",
          message: "Your service enquiry has been submitted. Our team will contact you soon.",
          icon: "help-circle",
          reference_type: "service_enquiry",
          reference_id: "enq_1",
          action_url: "/services",
        };
        break;
      case "service_cart_abandon":
        payload = {
          module: "service",
          type: "service_cart_abandon",
          title: "Complete your service request! 💼",
          message: "You have service items left in your cart. Let our experts assist you today!",
          icon: "briefcase",
          reference_type: "service_cart",
          reference_id: "service_cart_abandon",
          action_url: "/cart",
        };
        break;
      case "service_bundle_upsell":
        payload = {
          module: "service",
          type: "service_bundle_upsell",
          title: "Get the complete package! 📦",
          message: "Save by adding Income Tax Return to complete your Corporate Setup pack!",
          icon: "gift",
          reference_type: "service_bundle",
          reference_id: "bundle_corp_1",
          action_url: "/services",
        };
        break;
      case "service_missing_docs":
        payload = {
          module: "service",
          type: "service_missing_docs",
          title: "Urgent: Upload Documents 📄",
          message: "We need your documents to begin work on GST Return Filing. Tap to upload now.",
          icon: "alert-circle",
          reference_type: "service_order",
          reference_id: "order_srv_1",
          action_url: "/orders/order-details/order_srv_1",
        };
        break;
      case "bill_due":
        payload = {
          module: "bbps",
          type: "bbps_bill_due",
          title: "Bill Due Alert ⚡",
          message: "Your electricity/gas bill is due soon. Pay via Reward Planners and earn double coins!",
          icon: "zap",
          reference_type: "bbps_bill",
          reference_id: "bill_fetch_1",
          action_url: "/bbps",
        };
        break;
      case "recharge_reminder":
        payload = {
          module: "bbps",
          type: "bbps_recharge_reminder",
          title: "Prepaid Plan Expiring 📱",
          message: "Time to recharge! Keep your calls and data active. Click here to recharge in 1 tap.",
          icon: "smartphone",
          reference_type: "bbps_transaction",
          reference_id: "txn_recharge_1",
          action_url: "/bbps",
        };
        break;
      case "bbps_success":
        payload = {
          module: "bbps",
          type: "bbps_payment_success",
          title: "Payment Successful! ✅",
          message: "Your payment of Rs. 850.00 for Tata Power was processed. A receipt has been generated.",
          icon: "receipt",
          reference_type: "bbps_transaction",
          reference_id: "txn_recharge_1",
          action_url: "/bbps",
        };
        break;
      case "fitness_midday":
        payload = {
          module: "fitness",
          type: "fitness_midday_hook",
          title: "Let's get moving! 🚶‍♂️",
          message: "You've walked 1200 steps today. Take a quick stroll to hit your daily goal!",
          icon: "footprints",
          reference_type: "fitness_goal",
          reference_id: "midday_hook",
          action_url: "/fitness",
        };
        break;
      case "fitness_almost":
        payload = {
          module: "fitness",
          type: "fitness_almost_completed",
          title: "Almost there! 🏁",
          message: "Only 1500 steps left to achieve your daily target. You can do it!",
          icon: "award",
          reference_type: "fitness_goal",
          reference_id: "almost_completed",
          action_url: "/fitness",
        };
        break;
      case "fitness_goal_achieved":
        payload = {
          module: "fitness",
          type: "fitness_reward_earned",
          title: "Daily Goal Achieved! 🎉",
          message: "Incredible job! You reached your step target and earned 50 Reward Coins!",
          icon: "footprints",
          reference_type: "fitness_reward",
          reference_id: "fit_reward_1",
          action_url: "/fitness/wallet",
        };
        break;
      default:
        return res.status(400).json({ ok: false, error: "Invalid notification type" });
    }

    notifyUser({
      userId,
      ...payload
    }, `test single: ${type}`);

    return res.json({ ok: true, message: `Notification of type ${type} triggered successfully!` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
