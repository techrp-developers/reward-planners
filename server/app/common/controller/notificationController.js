const NotificationModel = require("../models/notificationModel");
const db = require("../../../config/database");
const fs = require("fs");
const path = require("path");


class NotificationController {
  /* ================================
     GET NOTIFICATIONS
  ================================= */
  async getMyNotifications(req, res) {
    try {
      // const userId = req.user?.user_id;
      const userId = 1; // temporary

      const notifications = await NotificationModel.getByUser(userId);

      return res.json({
        success: true,
        data: notifications,
      });
    } catch (error) {
      console.error("Fetch Notifications Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch notifications",
      });
    }
  }

  /* ================================
     MARK AS READ
  ================================= */
  async markAsRead(req, res) {
    try {
      // const userId = req.user?.user_id;
      const userId = 1;

      const { notification_id } = req.params;

      await NotificationModel.markAsRead(notification_id, userId);

      return res.json({
        success: true,
        message: "Notification marked as read",
      });
    } catch (error) {
      console.error("Mark Read Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to mark as read",
      });
    }
  }

  /* ================================
     BADGE COUNT
  ================================= */
  async getUnreadBadge(req, res) {
    try {
      const userId = 1;

      const count = await NotificationModel.getUnreadCount(userId);

      return res.json({
        success: true,
        count,
      });
    } catch (error) {
      console.error("Notification Badge Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch badge count",
      });
    }
  }
}

module.exports = new NotificationController();