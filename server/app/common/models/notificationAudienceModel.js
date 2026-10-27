const db = require("../../../config/database");

// Development/test recipients for "Send Test" and test-only campaigns. An
// explicit allow-list keeps test sends from ever reaching real employees.
function getTestUserIds(env = process.env) {
  return [...new Set(String(env.NOTIFICATION_TEST_USER_IDS || "")
    .split(",").map((value) => Number(value.trim()))
    .filter((id) => Number.isSafeInteger(id) && id > 0))];
}

class NotificationAudienceModel {
  /**
   * Company scope for a dashboard user, from verified data only:
   * admin -> global; rm -> rm_company_assignments rows (none if the table has
   * not been created). Any other role has no scope.
   */
  async getScope(user) {
    if (user?.role === "admin") {
      return { role: "admin", global: true, companyIds: [], assignmentsAvailable: true };
    }
    if (user?.role !== "rm") {
      return { role: user?.role || null, global: false, companyIds: [], assignmentsAvailable: false };
    }

    try {
      const [rows] = await db.execute(
        "SELECT company_id FROM rm_company_assignments WHERE rm_user_id = ?",
        [user.user_id],
      );
      return { role: "rm", global: false, companyIds: rows.map((row) => Number(row.company_id)), assignmentsAvailable: true };
    } catch (error) {
      if (error.code !== "ER_NO_SUCH_TABLE") throw error;
      return { role: "rm", global: false, companyIds: [], assignmentsAvailable: false };
    }
  }

  /** SQL fragment + params restricting customer alias `c` to the scope. */
  scopeFilter(scope, alias = "c") {
    if (scope.global) return { sql: "1 = 1", params: [] };
    if (!scope.companyIds.length) return { sql: "1 = 0", params: [] };
    return { sql: `${alias}.company_id IN (${scope.companyIds.map(() => "?").join(",")})`, params: [...scope.companyIds] };
  }

  /**
   * WHERE clause selecting the campaign audience among active employees.
   * Callers must have run checkAudiencePermission first; this still applies
   * the scope so a forged filter can never widen the audience.
   */
  audienceWhere(audienceType, filter, scope) {
    const where = ["c.status = 1", "c.deleted_at IS NULL"];
    const params = [];
    const inList = (column, ids) => {
      where.push(ids.length ? `${column} IN (${ids.map(() => "?").join(",")})` : "1 = 0");
      params.push(...ids);
    };

    if (audienceType === "test") {
      inList("c.user_id", getTestUserIds());
      return { sql: where.join(" AND "), params };
    }

    if (audienceType !== "all_companies") {
      const scoped = this.scopeFilter(scope);
      where.push(scoped.sql);
      params.push(...scoped.params);
    }

    if (audienceType === "individual" || audienceType === "selected") inList("c.user_id", filter.user_ids || []);
    if (audienceType === "company") inList("c.company_id", filter.company_ids || []);
    if (audienceType === "module_users") {
      if (filter.company_ids?.length) inList("c.company_id", filter.company_ids);
      where.push(`EXISTS (
        SELECT 1 FROM notifications mn
        WHERE mn.user_id = c.user_id AND mn.module = ? AND mn.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
      )`);
      params.push(filter.module);
    }
    if (audienceType === "all_companies" && !scope.global) where.push("1 = 0");

    return { sql: where.join(" AND "), params };
  }

  /** Counts only; no employee data leaves this method. */
  async preview(audienceType, filter, scope) {
    const { sql, params } = this.audienceWhere(audienceType, filter, scope);
    const [[row]] = await db.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(COALESCE(np.language, 'en') = 'en') AS lang_en,
        SUM(np.language = 'hi') AS lang_hi,
        SUM(np.language = 'mr') AS lang_mr,
        SUM(np.user_id IS NOT NULL AND np.marketing_enabled = 1) AS marketing_consented,
        SUM(np.user_id IS NOT NULL AND np.engagement_enabled = 1) AS engagement_consented,
        SUM(np.user_id IS NULL) AS no_preference_record,
        SUM(EXISTS (
          SELECT 1 FROM user_push_tokens upt WHERE upt.user_id = c.user_id AND upt.is_active = 1
        ) OR (c.fcm_token IS NOT NULL AND c.fcm_token <> '')) AS with_device
      FROM customer c
      LEFT JOIN notification_preferences np ON np.user_id = c.user_id
      WHERE ${sql}
      `,
      params,
    );
    const n = (value) => Number(value || 0);
    return {
      total: n(row.total),
      withDevice: n(row.with_device),
      languages: { en: n(row.lang_en), hi: n(row.lang_hi), mr: n(row.lang_mr) },
      marketingConsented: n(row.marketing_consented),
      engagementConsented: n(row.engagement_consented),
      noPreferenceRecord: n(row.no_preference_record),
    };
  }

  /** Recipients with their stored language, for queue materialisation. */
  async listRecipients(audienceType, filter, scope) {
    const { sql, params } = this.audienceWhere(audienceType, filter, scope);
    const [rows] = await db.query(
      `
      SELECT c.user_id, COALESCE(np.language, 'en') AS language
      FROM customer c
      LEFT JOIN notification_preferences np ON np.user_id = c.user_id
      WHERE ${sql}
      ORDER BY c.user_id
      `,
      params,
    );
    return rows;
  }

  async listCompanies(scope) {
    const scoped = this.scopeFilter(scope, "co");
    const [rows] = await db.query(
      `
      SELECT co.company_id, co.company_name,
             COUNT(c.user_id) AS active_employees
      FROM companies co
      LEFT JOIN customer c ON c.company_id = co.company_id AND c.status = 1 AND c.deleted_at IS NULL
      WHERE co.status = 1 AND ${scoped.sql}
      GROUP BY co.company_id, co.company_name
      ORDER BY co.company_name
      `,
      scoped.params,
    );
    return rows.map((row) => ({ ...row, active_employees: Number(row.active_employees || 0) }));
  }

  async searchEmployees(scope, { search = "", companyId = null, limit = 25 } = {}) {
    const scoped = this.scopeFilter(scope);
    const where = ["c.status = 1", "c.deleted_at IS NULL", scoped.sql];
    const params = [...scoped.params];
    if (companyId) { where.push("c.company_id = ?"); params.push(companyId); }
    if (search) {
      where.push("(c.name LIKE ? OR c.email LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    const [rows] = await db.query(
      `
      SELECT c.user_id, c.name, c.email, c.company_id, co.company_name
      FROM customer c
      LEFT JOIN companies co ON co.company_id = c.company_id
      WHERE ${where.join(" AND ")}
      ORDER BY c.name
      LIMIT ?
      `,
      [...params, Math.min(Number(limit) || 25, 50)],
    );
    return rows;
  }

  async getTestUsers() {
    const ids = getTestUserIds();
    if (!ids.length) return [];
    const [rows] = await db.query(
      `
      SELECT c.user_id, c.name, c.company_id, COALESCE(np.language, 'en') AS language,
             EXISTS (SELECT 1 FROM user_push_tokens upt WHERE upt.user_id = c.user_id AND upt.is_active = 1) AS has_device
      FROM customer c
      LEFT JOIN notification_preferences np ON np.user_id = c.user_id
      WHERE c.user_id IN (${ids.map(() => "?").join(",")}) AND c.status = 1 AND c.deleted_at IS NULL
      `,
      ids,
    );
    return rows.map((row) => ({ ...row, has_device: Boolean(row.has_device) }));
  }
}

module.exports = new NotificationAudienceModel();
module.exports.getTestUserIds = getTestUserIds;
