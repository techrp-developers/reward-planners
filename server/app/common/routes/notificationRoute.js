const express = require("express");
const router = express.Router();
const notificationController = require("../controller/notificationController");
const auth = require("../middlewares/auth");

// my notification details
router.get("/my-notification", auth, notificationController.getMyNotifications);

// notification badge
router.get("/notification-badge", auth, notificationController.getUnreadBadge);

// checked notifications
router.put(
  "/read/:notification_id",
  auth,
  notificationController.markAsRead,
);

module.exports = router;
