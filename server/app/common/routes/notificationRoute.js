const express = require("express");
const router = express.Router();

const notificationController = require("../controller/notificationController");
const auth = require("../middlewares/auth");

// my notification details
router.get("/my-notification", auth, notificationController.getMyNotifications);

// notification badge
router.get("/notification-badge", auth, notificationController.getUnreadBadge);

// mark as read
router.put("/read/:notification_id", auth, notificationController.markAsRead);

// read all
router.put("/read-all", auth, notificationController.markAllAsRead);

// delete
router.delete(
  "/:notification_id",
  auth,
  notificationController.deleteNotification,
);

module.exports = router;
