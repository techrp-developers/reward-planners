const db = require("../../../config/database");

class StatusModel {
  async create(data) {
    const [result] = await db.execute(
      `INSERT INTO user_statuses
       (user_id, type, text_content, background_color, font_style, media_key, media_mime_type, media_duration_seconds, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR))`,
      [data.userId, data.type, data.textContent, data.backgroundColor, data.fontStyle,
        data.mediaKey, data.mediaMimeType, data.mediaDurationSeconds],
    );
    return this.findActiveById(result.insertId);
  }

  async findActiveById(statusId) {
    const [rows] = await db.execute(
      `SELECT s.*, c.name AS user_name, c.user_image,
              (SELECT COUNT(*) FROM user_status_views v WHERE v.status_id = s.status_id) AS view_count
       FROM user_statuses s
       INNER JOIN customer c ON c.user_id = s.user_id
       WHERE s.status_id = ? AND s.deleted_at IS NULL AND s.expires_at > UTC_TIMESTAMP()
       LIMIT 1`,
      [statusId],
    );
    return rows[0] || null;
  }

  async getMine(userId) {
    const [rows] = await db.execute(
      `SELECT s.*, c.name AS user_name, c.user_image,
              (SELECT COUNT(*) FROM user_status_views v WHERE v.status_id = s.status_id) AS view_count
       FROM user_statuses s
       INNER JOIN customer c ON c.user_id = s.user_id
       WHERE s.user_id = ? AND s.deleted_at IS NULL AND s.expires_at > UTC_TIMESTAMP()
       ORDER BY s.created_at ASC`,
      [userId],
    );
    return rows;
  }

  async getFeed(viewerId, userIds) {
    const params = [viewerId];
    let contactFilter = "";
    if (userIds.length) {
      contactFilter = ` AND s.user_id IN (${userIds.map(() => "?").join(",")})`;
      params.push(...userIds);
    }
    const [rows] = await db.execute(
      `SELECT s.*, c.name AS user_name, c.user_image,
              IF(v.status_id IS NULL, 0, 1) AS viewed
       FROM user_statuses s
       INNER JOIN customer c ON c.user_id = s.user_id AND c.status = 1
       LEFT JOIN user_status_views v ON v.status_id = s.status_id AND v.viewer_id = ?
       WHERE s.deleted_at IS NULL AND s.expires_at > UTC_TIMESTAMP()${contactFilter}
       ORDER BY viewed ASC, s.created_at ASC`,
      params,
    );
    return rows;
  }

  async markViewed(statusId, viewerId) {
    const status = await this.findActiveById(statusId);
    if (!status) return null;
    if (Number(status.user_id) !== Number(viewerId)) {
      await db.execute(
        `INSERT INTO user_status_views (status_id, viewer_id)
         VALUES (?, ?) ON DUPLICATE KEY UPDATE viewed_at = viewed_at`,
        [statusId, viewerId],
      );
    }
    return status;
  }

  async getViews(statusId, ownerId) {
    const [owned] = await db.execute(
      `SELECT status_id FROM user_statuses WHERE status_id = ? AND user_id = ? AND deleted_at IS NULL`,
      [statusId, ownerId],
    );
    if (!owned.length) return null;
    const [rows] = await db.execute(
      `SELECT v.viewer_id AS user_id, c.name, c.user_image, v.viewed_at
       FROM user_status_views v INNER JOIN customer c ON c.user_id = v.viewer_id
       WHERE v.status_id = ? ORDER BY v.viewed_at DESC`,
      [statusId],
    );
    return rows;
  }

  async softDelete(statusId, ownerId) {
    const [rows] = await db.execute(
      `SELECT media_key FROM user_statuses WHERE status_id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
      [statusId, ownerId],
    );
    if (!rows.length) return null;
    await db.execute(
      `UPDATE user_statuses SET deleted_at = UTC_TIMESTAMP() WHERE status_id = ? AND user_id = ?`,
      [statusId, ownerId],
    );
    return rows[0];
  }
}

module.exports = new StatusModel();
