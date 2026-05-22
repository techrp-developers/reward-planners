const express = require("express");
const router = express.Router();
const notificationController = require("../controller/notificationController");
const auth = require("../middlewares/auth");

router.get("/my-notification", auth, notificationController.getMyNotifications);

router.get("/notification-badge", auth, notificationController.getUnreadBadge);

router.put(
  "/read/:notification_id",
  auth,
  notificationController.markAsRead,
);

module.exports = router;
