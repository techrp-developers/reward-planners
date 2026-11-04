const db = require("../../../config/database");
const { startOfDayUtc } = require("../utils/campaignSchedule");

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

  /**
   * Notifications of `categories` the employee received since `sinceUtc`
   * (local midnight in the employee timezone, converted to UTC). created_at
   * is in the MySQL session zone, so it is converted before comparing.
   */
  async countCategoryToday(userId, categories, { sinceUtc, excludeNotificationId = null }) {
    const since = sinceUtc instanceof Date ? sinceUtc.toISOString().slice(0, 19).replace("T", " ") : sinceUtc;
    const [[row]] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM notifications
      WHERE user_id = ?
        AND CONVERT_TZ(created_at, @@session.time_zone, '+00:00') >= ?
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.category')) IN (?)
        AND notification_id <> ?
      `,
      [userId, since, categories, excludeNotificationId || 0],
    );
    return Number(row?.total || 0);
  }

  /** Back-compatible wrapper: marketing + engagement received today. */
  async countPromotionalToday(userId, excludeNotificationId = null) {
    return this.countCategoryToday(userId, ["marketing", "engagement"], { sinceUtc: startOfDayUtc(), excludeNotificationId });
  }
}

module.exports = new NotificationTemplateModel();
