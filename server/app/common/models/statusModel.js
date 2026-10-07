const db = require("../../../config/database");

class StatusModel {
  async create(data) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [[owner]] = await connection.execute(
        `SELECT cu.company_id
         FROM customer c LEFT JOIN company_users cu ON cu.id = c.company_user_id
         WHERE c.user_id = ? LIMIT 1`,
        [data.userId],
      );
      if (data.visibility !== "custom_people" && !owner?.company_id) {
        const error = new Error("Your account must be linked to a company for this visibility option");
        error.statusCode = 422;
        throw error;
      }
      if (data.excludedCompanyIds.length) {
        const [companies] = await connection.query(
          `SELECT company_id FROM companies WHERE status = 1 AND company_id IN (?)`,
          [data.excludedCompanyIds],
        );
        if (companies.length !== data.excludedCompanyIds.length) {
          const error = new Error("One or more excluded companies are invalid or inactive");
          error.statusCode = 422;
          throw error;
        }
      }
      if (data.allowedUserIds.length) {
        const [users] = await connection.query(
          `SELECT user_id FROM customer WHERE status = 1 AND is_verified = 1 AND user_id IN (?)`,
          [data.allowedUserIds],
        );
        if (users.length !== data.allowedUserIds.length) {
          const error = new Error("One or more selected people are invalid or inactive");
          error.statusCode = 422;
          throw error;
        }
      }
      const [result] = await connection.execute(
        `INSERT INTO user_statuses
         (user_id, company_id, visibility, type, text_content, background_color, font_style,
          media_key, media_mime_type, media_duration_seconds, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR))`,
        [data.userId, owner?.company_id || null, data.visibility, data.type, data.textContent,
          data.backgroundColor, data.fontStyle, data.mediaKey, data.mediaMimeType,
          data.mediaDurationSeconds],
      );

      if (data.excludedCompanyIds.length) {
        await connection.query(
          `INSERT INTO user_status_excluded_companies (status_id, company_id) VALUES ?`,
          [data.excludedCompanyIds.map((companyId) => [result.insertId, companyId])],
        );
      }
      if (data.allowedUserIds.length) {
        await connection.query(
          `INSERT INTO user_status_allowed_users (status_id, user_id) VALUES ?`,
          [data.allowedUserIds.map((userId) => [result.insertId, userId])],
        );
      }
      await connection.commit();
      return this.findActiveById(result.insertId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async findActiveById(statusId) {
    const [rows] = await db.execute(
      `SELECT s.*, c.name AS user_name, c.user_image,
              (SELECT COUNT(*) FROM user_status_views v WHERE v.status_id = s.status_id) AS view_count,
              (SELECT COUNT(*) FROM user_status_likes l WHERE l.status_id = s.status_id) AS like_count,
              (SELECT COUNT(*) FROM user_status_comments cm WHERE cm.status_id = s.status_id) AS comment_count
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
              (SELECT COUNT(*) FROM user_status_views v WHERE v.status_id = s.status_id) AS view_count,
              (SELECT COUNT(*) FROM user_status_likes l WHERE l.status_id = s.status_id) AS like_count,
              (SELECT COUNT(*) FROM user_status_comments cm WHERE cm.status_id = s.status_id) AS comment_count,
              EXISTS(SELECT 1 FROM user_status_likes mine
                     WHERE mine.status_id = s.status_id AND mine.user_id = ?) AS liked
       FROM user_statuses s
       INNER JOIN customer c ON c.user_id = s.user_id
       WHERE s.user_id = ? AND s.deleted_at IS NULL AND s.expires_at > UTC_TIMESTAMP()
       ORDER BY s.created_at ASC`,
      [userId, userId],
    );
    return rows;
  }

  async getAudienceOptions(viewerId, search) {
    const like = `%${String(search || "").slice(0, 100)}%`;
    const [companies] = await db.execute(
      `SELECT company_id AS id, company_name AS name, company_logo
       FROM companies
       WHERE status = 1 AND company_name LIKE ?
       ORDER BY company_name ASC LIMIT 50`,
      [like],
    );
    const [people] = await db.execute(
      `SELECT c.user_id AS id, c.name, c.user_image, cu.company_id, co.company_name
       FROM customer c
       INNER JOIN company_users cu ON cu.id = c.company_user_id AND cu.status = 1
       INNER JOIN companies co ON co.company_id = cu.company_id AND co.status = 1
       WHERE c.status = 1 AND c.is_verified = 1 AND c.user_id <> ?
         AND (c.name LIKE ? OR co.company_name LIKE ?)
       ORDER BY c.name ASC LIMIT 50`,
      [viewerId, like, like],
    );
    return { companies, people };
  }

  async getFeed(viewerId, userIds) {
    const params = [viewerId, viewerId];
    let contactFilter = "";
    if (userIds.length) {
      contactFilter = ` AND s.user_id IN (${userIds.map(() => "?").join(",")})`;
      params.push(...userIds);
    }
    const [rows] = await db.execute(
      `SELECT s.*, c.name AS user_name, c.user_image,
              IF(s.user_id = viewer.user_id OR v.status_id IS NOT NULL, 1, 0) AS viewed,
              (SELECT COUNT(*) FROM user_status_views status_view
               WHERE status_view.status_id = s.status_id) AS view_count,
              (SELECT COUNT(*) FROM user_status_likes status_like
               WHERE status_like.status_id = s.status_id) AS like_count,
              (SELECT COUNT(*) FROM user_status_comments status_comment
               WHERE status_comment.status_id = s.status_id) AS comment_count,
              EXISTS(SELECT 1 FROM user_status_likes my_like
                     WHERE my_like.status_id = s.status_id AND my_like.user_id = viewer.user_id) AS liked
       FROM user_statuses s
       INNER JOIN customer c ON c.user_id = s.user_id AND c.status = 1
       LEFT JOIN user_status_views v ON v.status_id = s.status_id AND v.viewer_id = ?
       LEFT JOIN customer viewer ON viewer.user_id = ?
       LEFT JOIN company_users viewer_employee ON viewer_employee.id = viewer.company_user_id
       WHERE s.deleted_at IS NULL AND s.expires_at > UTC_TIMESTAMP()
         AND (
           s.user_id = viewer.user_id
           OR (s.visibility = 'same_company' AND s.company_id IS NOT NULL
               AND viewer_employee.company_id = s.company_id)
           OR (s.visibility = 'all_companies' AND viewer_employee.company_id IS NOT NULL)
           OR (s.visibility = 'all_except_companies' AND viewer_employee.company_id IS NOT NULL
               AND NOT EXISTS (
                 SELECT 1 FROM user_status_excluded_companies excluded
                 WHERE excluded.status_id = s.status_id
                   AND excluded.company_id = viewer_employee.company_id
               ))
           OR (s.visibility = 'custom_people' AND EXISTS (
                 SELECT 1 FROM user_status_allowed_users allowed
                 WHERE allowed.status_id = s.status_id AND allowed.user_id = viewer.user_id
               ))
         )${contactFilter}
       ORDER BY viewed ASC, s.created_at ASC`,
      params,
    );
    return rows;
  }

  async markViewed(statusId, viewerId) {
    const [rows] = await db.execute(
      `SELECT s.*, c.name AS user_name, c.user_image
       FROM user_statuses s
       INNER JOIN customer c ON c.user_id = s.user_id
       LEFT JOIN customer viewer ON viewer.user_id = ?
       LEFT JOIN company_users viewer_employee ON viewer_employee.id = viewer.company_user_id
       WHERE s.status_id = ? AND s.deleted_at IS NULL AND s.expires_at > UTC_TIMESTAMP()
         AND (
           s.user_id = viewer.user_id
           OR (s.visibility = 'same_company' AND s.company_id IS NOT NULL AND viewer_employee.company_id = s.company_id)
           OR (s.visibility = 'all_companies' AND viewer_employee.company_id IS NOT NULL)
           OR (s.visibility = 'all_except_companies' AND viewer_employee.company_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM user_status_excluded_companies e
                               WHERE e.status_id = s.status_id AND e.company_id = viewer_employee.company_id))
           OR (s.visibility = 'custom_people' AND EXISTS
               (SELECT 1 FROM user_status_allowed_users a
                WHERE a.status_id = s.status_id AND a.user_id = viewer.user_id))
         ) LIMIT 1`,
      [viewerId, statusId],
    );
    const status = rows[0] || null;
    if (!status) return null;
    if (Number(status.user_id) !== Number(viewerId)) {
      await db.execute(
        `INSERT INTO user_status_views (status_id, viewer_id)
         VALUES (?, ?) ON DUPLICATE KEY UPDATE viewed_at = viewed_at`,
        [statusId, viewerId],
      );
    }
    const [[viewSummary]] = await db.execute(
      `SELECT COUNT(*) AS view_count FROM user_status_views WHERE status_id = ?`,
      [statusId],
    );
    status.viewed = 1;
    status.view_count = Number(viewSummary.view_count);
    return status;
  }

  async findAccessible(statusId, viewerId, executor = db) {
    const [rows] = await executor.execute(
      `SELECT s.status_id, s.user_id
       FROM user_statuses s
       LEFT JOIN customer viewer ON viewer.user_id = ?
       LEFT JOIN company_users viewer_employee ON viewer_employee.id = viewer.company_user_id
       WHERE s.status_id = ? AND s.deleted_at IS NULL AND s.expires_at > UTC_TIMESTAMP()
         AND (
           s.user_id = viewer.user_id
           OR (s.visibility = 'same_company' AND s.company_id IS NOT NULL
               AND viewer_employee.company_id = s.company_id)
           OR (s.visibility = 'all_companies' AND viewer_employee.company_id IS NOT NULL)
           OR (s.visibility = 'all_except_companies' AND viewer_employee.company_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM user_status_excluded_companies e
                               WHERE e.status_id = s.status_id AND e.company_id = viewer_employee.company_id))
           OR (s.visibility = 'custom_people' AND EXISTS
               (SELECT 1 FROM user_status_allowed_users a
                WHERE a.status_id = s.status_id AND a.user_id = viewer.user_id))
         ) LIMIT 1`,
      [viewerId, statusId],
    );
    return rows[0] || null;
  }

  async toggleLike(statusId, userId) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const status = await this.findAccessible(statusId, userId, connection);
      if (!status) {
        await connection.rollback();
        return null;
      }
      const [existing] = await connection.execute(
        `SELECT user_id FROM user_status_likes
         WHERE status_id = ? AND user_id = ? FOR UPDATE`,
        [statusId, userId],
      );
      const liked = existing.length === 0;
      if (liked) {
        await connection.execute(
          `INSERT INTO user_status_likes (status_id, user_id) VALUES (?, ?)`,
          [statusId, userId],
        );
      } else {
        await connection.execute(
          `DELETE FROM user_status_likes WHERE status_id = ? AND user_id = ?`,
          [statusId, userId],
        );
      }
      const [[summary]] = await connection.execute(
        `SELECT COUNT(*) AS like_count FROM user_status_likes WHERE status_id = ?`,
        [statusId],
      );
      await connection.commit();
      return { liked, like_count: Number(summary.like_count) };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getLikes(statusId, viewerId, limit = 50, beforeUserId = null) {
    if (!(await this.findAccessible(statusId, viewerId))) return null;
    const params = [statusId];
    const beforeClause = beforeUserId ? " AND l.user_id < ?" : "";
    if (beforeUserId) params.push(beforeUserId);
    params.push(limit);
    const [rows] = await db.execute(
      `SELECT l.user_id, c.name, c.user_image, l.created_at
       FROM user_status_likes l
       INNER JOIN customer c ON c.user_id = l.user_id
       WHERE l.status_id = ?${beforeClause}
       ORDER BY l.user_id DESC LIMIT ?`,
      params,
    );
    const [[summary]] = await db.execute(
      `SELECT COUNT(*) AS like_count FROM user_status_likes WHERE status_id = ?`,
      [statusId],
    );
    return { rows, like_count: Number(summary.like_count) };
  }

  async createComment(statusId, userId, commentText) {
    if (!(await this.findAccessible(statusId, userId))) return null;
    const [result] = await db.execute(
      `INSERT INTO user_status_comments (status_id, user_id, comment_text)
       VALUES (?, ?, ?)`,
      [statusId, userId, commentText],
    );
    const [rows] = await db.execute(
      `SELECT cm.comment_id, cm.status_id, cm.user_id, cm.comment_text,
              cm.created_at, cm.updated_at, c.name, c.user_image
       FROM user_status_comments cm
       INNER JOIN customer c ON c.user_id = cm.user_id
       WHERE cm.comment_id = ? LIMIT 1`,
      [result.insertId],
    );
    return rows[0];
  }

  async getComments(statusId, viewerId, limit = 50, beforeId = null) {
    if (!(await this.findAccessible(statusId, viewerId))) return null;
    const params = [statusId];
    const beforeClause = beforeId ? " AND cm.comment_id < ?" : "";
    if (beforeId) params.push(beforeId);
    params.push(limit);
    const [rows] = await db.execute(
      `SELECT cm.comment_id, cm.status_id, cm.user_id, cm.comment_text,
              cm.created_at, cm.updated_at, c.name, c.user_image
       FROM user_status_comments cm
       INNER JOIN customer c ON c.user_id = cm.user_id
       WHERE cm.status_id = ?${beforeClause}
       ORDER BY cm.comment_id DESC LIMIT ?`,
      params,
    );
    return rows;
  }

  async deleteComment(statusId, commentId, userId) {
    const [rows] = await db.execute(
      `SELECT cm.comment_id
       FROM user_status_comments cm
       INNER JOIN user_statuses s ON s.status_id = cm.status_id
       WHERE cm.comment_id = ? AND cm.status_id = ? AND s.deleted_at IS NULL
         AND (cm.user_id = ? OR s.user_id = ?) LIMIT 1`,
      [commentId, statusId, userId, userId],
    );
    if (!rows.length) return false;
    await db.execute(
      `DELETE FROM user_status_comments WHERE comment_id = ? AND status_id = ?`,
      [commentId, statusId],
    );
    return true;
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
