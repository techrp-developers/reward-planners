const db = require("../../../config/database");

class NotificationModel {
  /* ================================
     CREATE NOTIFICATION
  ================================= */
  async create(data) {
    const {
      user_id,
      module,
      type,
      title,
      message,
      icon,
      reference_type,
      reference_id,
      action_url,
      metadata,
      priority,
    } = data;

    const [result] = await db.execute(
      `
      INSERT INTO notifications
      (
        user_id,
        module,
        type,
        title,
        message,
        icon,
        reference_type,
        reference_id,
        action_url,
        metadata,
        priority
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        user_id,
        module,
        type,
        title,
        message,
        icon || null,
        reference_type || "none",
        reference_id || null,
        action_url || null,
        metadata ? JSON.stringify(metadata) : null,
        priority || "normal",
      ]
    );

    return result.insertId;
  }

  /* ================================
     FETCH USER NOTIFICATIONS
  ================================= */
  async getByUser(userId, limit = 50) {
    const [rows] = await db.execute(
      `
      SELECT
        notification_id,
        module,
        type,
        title,
        message,
        icon,
        reference_type,
        reference_id,
        action_url,
        metadata,
        priority,
        is_read,
        created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY notification_id DESC
      LIMIT ?
      `,
      [userId, Number(limit)]
    );

    return rows.map((row) => ({
      ...row,
      metadata:
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata,
    }));
  }

  /* ================================
     MARK AS READ
  ================================= */
  async markAsRead(notificationId, userId) {
    const [result] = await db.execute(
      `
      UPDATE notifications
      SET is_read = 1
      WHERE notification_id = ?
      AND user_id = ?
      `,
      [notificationId, userId]
    );

    return result.affectedRows;
  }

  /* ================================
     MARK ALL AS READ
  ================================= */
  async markAllAsRead(userId) {
    const [result] = await db.execute(
      `
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ?
      AND is_read = 0
      `,
      [userId]
    );

    return result.affectedRows;
  }

  /* ================================
     UNREAD COUNT
  ================================= */
  async getUnreadCount(userId) {
    const [[row]] = await db.execute(
      `
      SELECT COUNT(*) AS total
      FROM notifications
      WHERE user_id = ?
      AND is_read = 0
      `,
      [userId]
    );

    return row.total;
  }

  /* ================================
     DELETE NOTIFICATION
  ================================= */
  async delete(notificationId, userId) {
    const [result] = await db.execute(
      `
      DELETE FROM notifications
      WHERE notification_id = ?
      AND user_id = ?
      `,
      [notificationId, userId]
    );

    return result.affectedRows;
  }
}

module.exports = new NotificationModel();