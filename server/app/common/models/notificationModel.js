const db = require("../../../config/database");

class NotificationModel {
  /* ================================
     CREATE NOTIFICATION
  ================================= */
  async create(data) {
    const {
      user_id,
      type,
      title,
      message,
      reference_type,
      reference_id,
    } = data;

    await db.execute(
      `
      INSERT INTO notifications
      (user_id, type, title, message, reference_type, reference_id)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        user_id,
        type,
        title,
        message,
        reference_type || "none",
        reference_id || null,
      ]
    );
  }

  /* ================================
     FETCH USER NOTIFICATIONS
  ================================= */
  async getByUser(userId) {
    const [rows] = await db.execute(
      `
      SELECT
        notification_id,
        type,
        title,
        message,
        reference_type,
        reference_id,
        is_read,
        created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      `,
      [userId]
    );

    return rows;
  }

  /* ================================
     MARK AS READ
  ================================= */
  async markAsRead(notificationId, userId) {
    await db.execute(
      `
      UPDATE notifications
      SET is_read = 1
      WHERE notification_id = ? AND user_id = ?
      `,
      [notificationId, userId]
    );
  }

  /* ================================
     UNREAD COUNT (BADGE)
  ================================= */
  async getUnreadCount(userId) {
    const [[row]] = await db.execute(
      `
      SELECT COUNT(*) AS total
      FROM notifications
      WHERE user_id = ? AND is_read = 0
      `,
      [userId]
    );

    return row.total;
  }
}

module.exports = new NotificationModel();