const db = require("../config/database");

// content_zone_entries keeps start_at/end_at as DATETIME in the database
// session's time zone (the existing CMS compares them with NOW()). Splash
// resolution converts them to UTC instead of storing a second convention, so
// historical CMS rows are never reinterpreted.
const UTC = (column) => `CONVERT_TZ(${column}, @@session.time_zone, '+00:00')`;

// First active gallery image, else the entry's own image.
const IMAGE_PATH = `COALESCE((
    SELECT i.image_url FROM content_zone_entry_images i
    WHERE i.content_id = e.content_id AND i.is_active = 1
    ORDER BY i.sort_order ASC, i.image_id ASC LIMIT 1
  ), e.image_url)`;

const ENTRY_COLUMNS = `e.content_id, e.module, e.zone, e.content_type, e.display_mode, e.title, e.cta_text,
  e.redirect_link, e.target_type, e.target_id, e.target_ids, e.priority, e.is_published,
  e.motion_effect, e.motion_intensity, e.motion_speed, e.updated_at,
  ${UTC("e.start_at")} AS start_utc, ${UTC("e.end_at")} AS end_utc, ${IMAGE_PATH} AS image_path`;

// Status of the entry at `now_utc` (start inclusive, end exclusive).
const ENTRY_STATUS = `CASE
    WHEN e.is_published = 0 THEN 'draft'
    WHEN e.start_at IS NOT NULL AND ${UTC("e.start_at")} > t.now_utc THEN 'scheduled'
    WHEN e.end_at IS NOT NULL AND ${UTC("e.end_at")} <= t.now_utc THEN 'expired'
    ELSE 'active' END`;

const NOW = "(SELECT COALESCE(?, UTC_TIMESTAMP()) AS now_utc) t";

// What the manager shows for a placement: a disabled placement first, then the entry's state.
const EFFECTIVE_STATUS = `CASE WHEN p.is_enabled = 0 THEN 'disabled' ELSE (${ENTRY_STATUS}) END`;
const LIST_STATUSES = { live: "active", scheduled: "scheduled", draft: "draft", expired: "expired", disabled: "disabled" };

// Live at now_utc: published, started (inclusive) and not yet ended (exclusive).
const LIVE = `e.is_published = 1
  AND (e.start_at IS NULL OR ${UTC("e.start_at")} <= t.now_utc)
  AND (e.end_at IS NULL OR ${UTC("e.end_at")} > t.now_utc)`;

class SplashscreenModel {
  async serverTimeUtc() {
    const [[row]] = await db.query("SELECT UTC_TIMESTAMP() AS now_utc");
    return row.now_utc;
  }

  /* ---------------- placements ---------------- */

  async listPlacements({ pageKey, slotKey, platform, audience, enabled, contentId, status, search, page = 1, pageSize = 20 } = {}) {
    const where = [];
    const params = [null];
    if (pageKey) { where.push("p.page_key = ?"); params.push(pageKey); }
    if (slotKey) { where.push("p.slot_key = ?"); params.push(slotKey); }
    if (platform) { where.push("p.platform = ?"); params.push(platform); }
    if (audience) { where.push("p.audience = ?"); params.push(audience); }
    if (enabled != null) { where.push("p.is_enabled = ?"); params.push(enabled ? 1 : 0); }
    if (contentId) { where.push("p.content_id = ?"); params.push(contentId); }
    if (search) { where.push("e.title LIKE ?"); params.push(`%${search}%`); }
    // Counts per status for the same filters, before the status tab narrows the list.
    const baseWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [counts] = await db.query(
      `SELECT ${EFFECTIVE_STATUS} AS effective, COUNT(*) AS n
       FROM cms_splashscreen_placements p
       JOIN content_zone_entries e ON e.content_id = p.content_id
       CROSS JOIN ${NOW}
       ${baseWhere}
       GROUP BY effective`,
      params,
    );
    if (status && LIST_STATUSES[status]) { where.push(`${EFFECTIVE_STATUS} = ?`); params.push(LIST_STATUSES[status]); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const current = Math.max(Number(page) || 1, 1);

    const [rows] = await db.query(
      `SELECT p.*, ${ENTRY_COLUMNS}, ${ENTRY_STATUS} AS content_status, ${EFFECTIVE_STATUS} AS effective_status
       FROM cms_splashscreen_placements p
       JOIN content_zone_entries e ON e.content_id = p.content_id
       CROSS JOIN ${NOW}
       ${whereSql}
       ORDER BY p.page_key, p.slot_key, e.priority DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, size, (current - 1) * size],
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM cms_splashscreen_placements p
       JOIN content_zone_entries e ON e.content_id = p.content_id
       CROSS JOIN ${NOW}
       ${whereSql}`,
      params,
    );
    const byStatus = Object.fromEntries(counts.map((row) => [row.effective, Number(row.n)]));
    const summary = {
      total: counts.reduce((sum, row) => sum + Number(row.n), 0),
      live: byStatus.active || 0, scheduled: byStatus.scheduled || 0, draft: byStatus.draft || 0,
      expired: byStatus.expired || 0, disabled: byStatus.disabled || 0,
    };
    return { placements: rows, total: Number(total), page: current, pageSize: size, summary };
  }

  async getPlacement(id) {
    const [[row]] = await db.query(
      `SELECT p.*, ${ENTRY_COLUMNS}, ${ENTRY_STATUS} AS content_status, ${EFFECTIVE_STATUS} AS effective_status
       FROM cms_splashscreen_placements p
       JOIN content_zone_entries e ON e.content_id = p.content_id
       CROSS JOIN ${NOW}
       WHERE p.id = ?`,
      [null, id],
    );
    return row || null;
  }

  async createPlacement(values) {
    const [result] = await db.query(
      `INSERT INTO cms_splashscreen_placements
         (content_id, page_key, slot_key, platform, audience, frequency_rule, display_seconds, is_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [values.content_id, values.page_key, values.slot_key, values.platform, values.audience,
        values.frequency_rule, values.display_seconds, values.is_enabled ? 1 : 0],
    );
    return result.insertId;
  }

  async updatePlacement(id, patch) {
    const allowed = ["platform", "audience", "frequency_rule", "display_seconds", "is_enabled"];
    const fields = allowed.filter((key) => Object.hasOwn(patch, key));
    if (!fields.length) return 0;
    const [result] = await db.query(
      `UPDATE cms_splashscreen_placements SET ${fields.map((key) => `${key} = ?`).join(", ")} WHERE id = ?`,
      [...fields.map((key) => (key === "is_enabled" ? (patch[key] ? 1 : 0) : patch[key])), id],
    );
    return result.affectedRows;
  }

  async deletePlacement(id) {
    const [result] = await db.query("DELETE FROM cms_splashscreen_placements WHERE id = ?", [id]);
    return result.affectedRows;
  }

  /* ---------------- defaults ---------------- */

  async listDefaults() {
    const [rows] = await db.query(
      `SELECT d.*, e.title AS content_title, e.is_published AS content_published,
         ${UTC("e.end_at")} AS content_end_utc
       FROM cms_splashscreen_defaults d
       LEFT JOIN content_zone_entries e ON e.content_id = d.default_content_id
       ORDER BY d.page_key, d.slot_key, d.platform`,
    );
    return rows;
  }

  /** Create or replace the default for one page/slot/platform (one atomic statement). */
  async upsertDefault({ page_key, slot_key, platform, fallback_policy, default_content_id }) {
    await db.query(
      `INSERT INTO cms_splashscreen_defaults (page_key, slot_key, platform, fallback_policy, default_content_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE fallback_policy = VALUES(fallback_policy), default_content_id = VALUES(default_content_id)`,
      [page_key, slot_key, platform, fallback_policy, default_content_id],
    );
    const [[row]] = await db.query(
      "SELECT * FROM cms_splashscreen_defaults WHERE page_key = ? AND slot_key = ? AND platform = ?",
      [page_key, slot_key, platform],
    );
    return row;
  }

  /**
   * Make an unpublished entry the default and publish it in one transaction,
   * so it is never live without being linked (an unlinked live entry would
   * compete for its ordinary CMS zone).
   */
  async upsertDefaultAndPublish(values) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO cms_splashscreen_defaults (page_key, slot_key, platform, fallback_policy, default_content_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE fallback_policy = VALUES(fallback_policy), default_content_id = VALUES(default_content_id)`,
        [values.page_key, values.slot_key, values.platform, values.fallback_policy, values.default_content_id],
      );
      await conn.query(
        "UPDATE content_zone_entries SET is_published = 1, start_at = COALESCE(start_at, NOW()) WHERE content_id = ?",
        [values.default_content_id],
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback().catch(() => {});
      throw error;
    } finally {
      conn.release();
    }
    const [[row]] = await db.query(
      "SELECT * FROM cms_splashscreen_defaults WHERE page_key = ? AND slot_key = ? AND platform = ?",
      [values.page_key, values.slot_key, values.platform],
    );
    return row;
  }

  /** The platform-specific default if there is one, else the 'all' default. */
  async findDefault(pageKey, slotKey, platform) {
    const [[row]] = await db.query(
      `SELECT * FROM cms_splashscreen_defaults
       WHERE page_key = ? AND slot_key = ? AND platform IN ('all', ?)
       ORDER BY platform = 'all' ASC LIMIT 1`,
      [pageKey, slotKey, platform],
    );
    return row || null;
  }

  /* ---------------- content ---------------- */

  /** The entry with its UTC schedule, current status and artwork path. */
  async getEntry(contentId, nowUtc = null) {
    const [[row]] = await db.query(
      `SELECT ${ENTRY_COLUMNS}, ${ENTRY_STATUS} AS content_status
       FROM content_zone_entries e CROSS JOIN ${NOW}
       WHERE e.content_id = ?`,
      [nowUtc, contentId],
    );
    return row || null;
  }

  /* ---------------- resolution ---------------- */

  /**
   * Live placements for a page/slot, best first. Precedence: priority, then a
   * platform-specific placement over 'all', then an audience-specific one over
   * 'all', then the latest start, then the newest entry, then the oldest
   * placement. The caller takes the first one whose artwork is usable.
   */
  async liveCandidates({ pageKey, slotKey, platform, audience, nowUtc = null, limit = 20 }) {
    const [rows] = await db.query(
      `SELECT p.id AS placement_id, p.platform AS placement_platform, p.audience AS placement_audience,
         p.frequency_rule, p.display_seconds, ${ENTRY_COLUMNS}
       FROM cms_splashscreen_placements p
       JOIN content_zone_entries e ON e.content_id = p.content_id
       CROSS JOIN ${NOW}
       WHERE p.page_key = ? AND p.slot_key = ? AND p.is_enabled = 1
         AND p.platform IN ('all', ?) AND p.audience IN ('all', ?)
         AND e.content_type = 'image'
         AND ${LIVE}
       ORDER BY e.priority DESC, p.platform = 'all' ASC, p.audience = 'all' ASC,
         COALESCE(${UTC("e.start_at")}, '1000-01-01') DESC, e.content_id DESC, p.id ASC
       LIMIT ?`,
      [nowUtc, pageKey, slotKey, platform, audience, limit],
    );
    return rows;
  }

  /** When the next scheduled campaign for this page/slot starts, so the app knows when to look again. */
  async nextStartUtc({ pageKey, slotKey, platform, audience, nowUtc = null }) {
    const [[row]] = await db.query(
      `SELECT MIN(${UTC("e.start_at")}) AS next_start
       FROM cms_splashscreen_placements p
       JOIN content_zone_entries e ON e.content_id = p.content_id
       CROSS JOIN ${NOW}
       WHERE p.page_key = ? AND p.slot_key = ? AND p.is_enabled = 1
         AND p.platform IN ('all', ?) AND p.audience IN ('all', ?)
         AND e.is_published = 1 AND e.start_at IS NOT NULL AND ${UTC("e.start_at")} > t.now_utc`,
      [nowUtc, pageKey, slotKey, platform, audience],
    );
    return row?.next_start || null;
  }
}

module.exports = new SplashscreenModel();
