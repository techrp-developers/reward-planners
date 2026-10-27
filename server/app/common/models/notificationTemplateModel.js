const db = require("../../../config/database");

// Templates change rarely and are read on every templated send. A short cache
// keeps admin edits visible within a minute without a query per notification.
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

class NotificationTemplateModel {
  async findByKey(templateKey) {
    const cached = cache.get(templateKey);
    if (cached && cached.expiresAt > Date.now()) return cached.row;

    const [[row]] = await db.execute(
      `
      SELECT template_id, template_key, module, notification_type, priority,
             title_en, body_en, title_mr, body_mr, title_hi, body_hi,
             deep_link_pattern, localization_status, is_enabled
      FROM notification_templates
      WHERE template_key = ?
      LIMIT 1
      `,
      [templateKey],
    );

    cache.set(templateKey, { row: row || null, expiresAt: Date.now() + CACHE_TTL_MS });
    return row || null;
  }

  clearCache() {
    cache.clear();
  }

  /**
   * Marketing/engagement eligibility. Returns null when the
   * notification_preferences table (migrations/20261026_03) is not applied.
   * A missing row is flagged `missing`: English, and no marketing consent.
   */
  async getPreferences(userId) {
    try {
      const [[row]] = await db.execute(
        `
        SELECT language, marketing_enabled, engagement_enabled,
               quiet_hours_start, quiet_hours_end
        FROM notification_preferences
        WHERE user_id = ?
        LIMIT 1
        `,
        [userId],
      );
      return row || { language: null, marketing_enabled: 0, engagement_enabled: 0, missing: true };
    } catch (error) {
      if (error.code === "ER_NO_SUCH_TABLE") return null;
      throw error;
    }
  }

  /**
   * Upsert only the provided fields. A first save from the app creates the row
   * with marketing/engagement off unless the employee explicitly opted in:
   * choosing a language is not marketing consent.
   */
  async savePreferences(userId, update) {
    const columns = Object.keys(update);
    const insert = {
      language: "en",
      marketing_enabled: 0,
      engagement_enabled: 0,
      quiet_hours_start: null,
      quiet_hours_end: null,
      ...update,
    };
    const insertColumns = Object.keys(insert);
    await db.execute(
      `INSERT INTO notification_preferences (user_id, ${insertColumns.join(", ")})
       VALUES (?, ${insertColumns.map(() => "?").join(", ")})
       ON DUPLICATE KEY UPDATE ${columns.map((column) => `${column} = VALUES(${column})`).join(", ")}`,
      [userId, ...insertColumns.map((column) => insert[column])],
    );
  }

  async countPromotionalToday(userId) {
    const [[row]] = await db.execute(
      `
      SELECT COUNT(*) AS total
      FROM notifications
      WHERE user_id = ?
        AND created_at >= CURDATE()
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.category')) IN ('marketing', 'engagement')
      `,
      [userId],
    );
    return Number(row?.total || 0);
  }
}

module.exports = new NotificationTemplateModel();
