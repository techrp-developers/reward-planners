const NotificationModel = require("../models/notificationModel");

function requireUserId(req, res) {
  const userId = req.user?.user_id;
  if (!userId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return null;
  }
  return userId;
}

class NotificationController {
  /* ================================
     GET MY NOTIFICATIONS
  ================================= */
  async getMyNotifications(req, res) {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const notifications =
        await NotificationModel.getByUser(userId, req.query.limit);

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
     MARK SINGLE READ
  ================================= */
  async markAsRead(req, res) {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const { notification_id } = req.params;

      const updated =
        await NotificationModel.markAsRead(
          notification_id,
          userId
        );

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
        });
      }

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
     MARK ALL READ
  ================================= */
  async markAllAsRead(req, res) {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      await NotificationModel.markAllAsRead(userId);

      return res.json({
        success: true,
        message: "All notifications marked as read",
      });
    } catch (error) {
      console.error("Mark All Read Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to mark all notifications",
      });
    }
  }

  /* ================================
     BADGE COUNT
  ================================= */
  async getUnreadBadge(req, res) {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const count =
        await NotificationModel.getUnreadCount(userId);

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

  /* ================================
     DELETE NOTIFICATION
  ================================= */
  async deleteNotification(req, res) {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const { notification_id } = req.params;

      const deleted =
        await NotificationModel.delete(
          notification_id,
          userId
        );

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
        });
      }

      return res.json({
        success: true,
        message: "Notification deleted",
      });
    } catch (error) {
      console.error("Delete Notification Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to delete notification",
      });
    }
  }
}

module.exports = new NotificationController();
