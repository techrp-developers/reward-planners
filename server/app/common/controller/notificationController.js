const NotificationModel = require("../models/notificationModel");
const NotificationTemplateModel = require("../models/notificationTemplateModel");
const { normalizePreferenceUpdate } = require("../utils/notificationTemplate");

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
     PUSH PREFERENCES (language, consent, quiet hours)
     The app calls PUT whenever the employee changes language so pushes are
     rendered in it. The user is always the authenticated customer.
  ================================= */
  async getPreferences(req, res) {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const prefs = await NotificationTemplateModel.getPreferences(userId);
      if (!prefs) {
        return res.status(503).json({ success: false, message: "Notification preferences are unavailable" });
      }
      return res.json({
        success: true,
        data: {
          language: prefs.language || "en",
          marketing_enabled: Number(prefs.marketing_enabled) === 1,
          engagement_enabled: Number(prefs.engagement_enabled) === 1,
          quiet_hours_start: prefs.quiet_hours_start ? String(prefs.quiet_hours_start).slice(0, 5) : null,
          quiet_hours_end: prefs.quiet_hours_end ? String(prefs.quiet_hours_end).slice(0, 5) : null,
          stored: !prefs.missing,
        },
      });
    } catch (error) {
      console.error("Get Notification Preferences Error:", error);
      return res.status(500).json({ success: false, message: "Failed to load preferences" });
    }
  }

  async updatePreferences(req, res) {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const { update, errors } = normalizePreferenceUpdate(req.body || {});
      if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

      await NotificationTemplateModel.savePreferences(userId, update);
      return this.getPreferences(req, res);
    } catch (error) {
      if (error.code === "ER_NO_SUCH_TABLE") {
        return res.status(503).json({ success: false, message: "Notification preferences are unavailable" });
      }
      console.error("Update Notification Preferences Error:", error);
      return res.status(500).json({ success: false, message: "Failed to save preferences" });
    }
  }

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
