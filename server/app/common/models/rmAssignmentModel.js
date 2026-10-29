const db = require("../../../config/database");

// RM -> company assignments (rm_company_assignments) decide which companies an
// RM may target with push notifications. Every change is written together
// with its audit row (notification_campaign_audit_logs, campaign_id NULL) in
// one transaction, so neither can exist without the other.
const AUDIT = {
  granted: "rm_assignment_granted",
  revoked: "rm_assignment_revoked",
  denied: "rm_assignment_denied",
};

const auditRow = (actor, action, details, ip, decision = "allowed") => [
  null, actor.user_id, actor.role, action, decision, JSON.stringify(details), ip ? String(ip).slice(0, 64) : null,
];
const AUDIT_SQL = `INSERT INTO notification_campaign_audit_logs
  (campaign_id, actor_user_id, actor_role, action, decision, details, ip_address)
  VALUES ?`;

class RmAssignmentModel {
  constructor(database = db) {
    this.db = database;
  }

  /** Verified RM accounts with their assignments (newest first). */
  async listRms() {
    const [rms] = await this.db.query(
      "SELECT user_id, name, email, is_verified FROM eusers WHERE role = 'rm' ORDER BY name, user_id",
    );
    const [rows] = await this.db.query(
      `SELECT a.rm_user_id, a.company_id, co.company_name, co.status AS company_status,
              a.assigned_by, ab.name AS assigned_by_name, a.created_at
       FROM rm_company_assignments a
       LEFT JOIN companies co ON co.company_id = a.company_id
       LEFT JOIN eusers ab ON ab.user_id = a.assigned_by
       ORDER BY a.created_at DESC, a.company_id`,
    );
    const byRm = new Map(rms.map((rm) => [Number(rm.user_id), { ...rm, is_verified: Number(rm.is_verified) === 1, companies: [] }]));
    // Rows for accounts that are no longer RMs are reported, never hidden.
    const orphaned = [];
    for (const row of rows) {
      const entry = { ...row, company_status: row.company_status == null ? null : Number(row.company_status) };
      (byRm.get(Number(row.rm_user_id))?.companies || orphaned).push(entry);
    }
    return { rms: [...byRm.values()], orphaned };
  }

  /** All companies with their status, active employees and assigned RM ids. */
  async listCompanies() {
    const [rows] = await this.db.query(
      `SELECT co.company_id, co.company_name, co.status,
              (SELECT COUNT(*) FROM customer c WHERE c.company_id = co.company_id AND c.status = 1 AND c.deleted_at IS NULL) AS active_employees,
              (SELECT GROUP_CONCAT(a.rm_user_id ORDER BY a.rm_user_id) FROM rm_company_assignments a WHERE a.company_id = co.company_id) AS rm_user_ids
       FROM companies co
       ORDER BY co.company_name, co.company_id`,
    );
    return rows.map((row) => ({
      company_id: row.company_id,
      company_name: row.company_name,
      status: Number(row.status),
      eligible: Number(row.status) === 1,
      active_employees: Number(row.active_employees || 0),
      rm_user_ids: row.rm_user_ids ? String(row.rm_user_ids).split(",").map(Number) : [],
    }));
  }

  /**
   * Assign companies to a verified RM. All ids are validated before anything
   * is written; existing assignments are left untouched (idempotent).
   * Returns { error } or { assigned, alreadyAssigned }.
   */
  async assign({ rmUserId, companyIds, actor, ip }) {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      const [[rm]] = await connection.query(
        "SELECT user_id, role, is_verified FROM eusers WHERE user_id = ?",
        [rmUserId],
      );
      if (!rm || rm.role !== "rm") {
        await connection.rollback();
        return { error: { status: 404, message: "No RM account with this id." } };
      }
      if (Number(rm.is_verified) !== 1) {
        await connection.rollback();
        return { error: { status: 409, message: "This RM account is not verified." } };
      }

      const [companies] = await connection.query(
        "SELECT company_id, status FROM companies WHERE company_id IN (?)",
        [companyIds],
      );
      const found = new Map(companies.map((row) => [Number(row.company_id), Number(row.status)]));
      const missing = companyIds.filter((id) => !found.has(id));
      const inactive = companyIds.filter((id) => found.has(id) && found.get(id) !== 1);
      if (missing.length || inactive.length) {
        await connection.rollback();
        return {
          error: {
            status: 422,
            message: missing.length ? `Unknown company id(s): ${missing.join(", ")}.` : `Inactive company id(s) cannot be assigned: ${inactive.join(", ")}.`,
            missing,
            inactive,
          },
        };
      }

      // INSERT IGNORE + the (rm_user_id, company_id) primary key: an existing
      // or concurrently created assignment is never duplicated or overwritten
      // (its original assigned_by and created_at stay). Row by row, so each
      // affectedRows says exactly which assignments this request created.
      const assigned = [];
      const alreadyAssigned = [];
      for (const companyId of companyIds) {
        const [result] = await connection.query(
          "INSERT IGNORE INTO rm_company_assignments (rm_user_id, company_id, assigned_by) VALUES (?, ?, ?)",
          [rmUserId, companyId, actor.user_id],
        );
        (result.affectedRows === 1 ? assigned : alreadyAssigned).push(companyId);
      }
      if (assigned.length) {
        await connection.query(AUDIT_SQL, [assigned.map((companyId) => auditRow(actor, AUDIT.granted, { rm_user_id: rmUserId, company_id: companyId }, ip))]);
      }
      await connection.commit();
      return { assigned, alreadyAssigned };
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }

  /** Remove one assignment. Returns { removed: boolean }. */
  async revoke({ rmUserId, companyId, actor, ip }) {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      const [[current]] = await connection.query(
        "SELECT assigned_by, created_at FROM rm_company_assignments WHERE rm_user_id = ? AND company_id = ? FOR UPDATE",
        [rmUserId, companyId],
      );
      if (!current) {
        await connection.rollback();
        return { removed: false };
      }
      await connection.query("DELETE FROM rm_company_assignments WHERE rm_user_id = ? AND company_id = ?", [rmUserId, companyId]);
      await connection.query(AUDIT_SQL, [[auditRow(actor, AUDIT.revoked, {
        rm_user_id: rmUserId, company_id: companyId, previously_assigned_by: current.assigned_by, assigned_at: current.created_at,
      }, ip)]]);
      await connection.commit();
      return { removed: true };
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }

  /** Best-effort record of a rejected attempt (never blocks the response). */
  async auditDenied({ actor, ip, details }) {
    try {
      await this.db.query(AUDIT_SQL, [[auditRow(actor, AUDIT.denied, details, ip, "denied")]]);
    } catch (error) {
      console.error("[RM Assignments] Failed to record denied attempt:", error.message);
    }
  }

  async auditTrail({ rmUserId = null, page = 1, limit = 50 } = {}) {
    const size = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
    const where = ["a.campaign_id IS NULL", "a.action IN (?)"];
    const params = [Object.values(AUDIT)];
    if (rmUserId) {
      where.push("JSON_VALUE(a.details, '$.rm_user_id') = ?");
      params.push(String(rmUserId));
    }
    const [rows] = await this.db.query(
      `SELECT a.audit_id, a.action, a.decision, a.details, a.actor_user_id, a.actor_role, eu.name AS actor_name, a.ip_address, a.created_at
       FROM notification_campaign_audit_logs a
       LEFT JOIN eusers eu ON eu.user_id = a.actor_user_id
       WHERE ${where.join(" AND ")}
       ORDER BY a.audit_id DESC
       LIMIT ? OFFSET ?`,
      [...params, size, offset],
    );
    return rows.map((row) => {
      let details = row.details;
      try { details = typeof details === "string" ? JSON.parse(details) : details; } catch { /* keep raw */ }
      return { ...row, details };
    });
  }
}

module.exports = new RmAssignmentModel();
module.exports.RmAssignmentModel = RmAssignmentModel;
module.exports.AUDIT_ACTIONS = AUDIT;
