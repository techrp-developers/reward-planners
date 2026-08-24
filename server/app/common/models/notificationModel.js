const db = require("../../../config/database");

function toDbValue(value) {
  return value === undefined ? null : value;
}

function parseMetadata(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 50;
  return Math.min(parsed, 100);
}

class NotificationModel {
  /* ================================
     CREATE NOTIFICATION
  ================================= */
  async create(data) {
    const {
      userId,
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
      idempotency_key,
      screen,
    } = data;

    const notificationUserId = userId ?? user_id;

    if (!notificationUserId || !module || !type || !title || !message) {
      console.error("[NOTIFICATION] Missing required fields:", {
        userId: notificationUserId,
        module,
        type,
        title,
        message,
      });
      return null;
    }

    const storedMetadata = screen
      ? { ...(metadata && typeof metadata === "object" ? metadata : {}), screen }
      : metadata;

    const values = [
      notificationUserId,
      module,
      type,
      title,
      message,
      toDbValue(icon) || null,
      toDbValue(reference_type) || "none",
      reference_id == null ? null : String(reference_id),
      toDbValue(action_url) || null,
      storedMetadata == null ? null : JSON.stringify(storedMetadata),
      toDbValue(priority) || "normal",
    ];

    if (idempotency_key) {
      try {
        const [result] = await db.execute(
          `
          INSERT INTO notifications
          (user_id, module, type, title, message, icon, reference_type,
           reference_id, action_url, metadata, priority, idempotency_key)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE notification_id = LAST_INSERT_ID(notification_id)
          `,
          [...values, String(idempotency_key).slice(0, 191)],
        );
        return { notificationId: result.insertId, created: result.affectedRows === 1 };
      } catch (error) {
        // Keep deployments backward-compatible while the additive migration is
        // being rolled out. Idempotency becomes active as soon as it is applied.
        if (error.code !== "ER_BAD_FIELD_ERROR") throw error;
      }
    }

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
      values,
    );

    return { notificationId: result.insertId, created: true };
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
      [userId, normalizeLimit(limit)],
    );

    return rows.map((row) => ({
      ...row,
      metadata: parseMetadata(row.metadata),
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
      [notificationId, userId],
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
      [userId],
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
      [userId],
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
      [notificationId, userId],
    );

    return result.affectedRows;
  }
}

module.exports = new NotificationModel();
