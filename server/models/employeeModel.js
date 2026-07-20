const db = require("../config/database");

class EmployeeModel {
  async getCompanyProfile(companyId) {
    const [[company]] = await db.execute(
      `SELECT company_id, company_name, company_logo
       FROM companies
       WHERE company_id = ? AND status = 1
       LIMIT 1`,
      [companyId],
    );
    return company;
  }

  buildStatusExpression() {
    return `CASE
      WHEN cu.status = 1 THEN 'active'
      ELSE 'inactive'
    END`;
  }

  async companyExists(companyId, conn = db) {
    const [[company]] = await conn.execute(
      `SELECT company_id
       FROM companies
       WHERE company_id = ? AND status = 1
       LIMIT 1`,
      [companyId],
    );
    return Boolean(company);
  }

  async findAll({
    companyId,
    search = "",
    status = "all",
    department = "",
    page = 1,
    limit = 20,
  }) {
    const statusExpression = this.buildStatusExpression();
    const conditions = ["cu.company_id = ?"];
    const params = [companyId];

    if (search) {
      conditions.push(`(
        cu.name LIKE ? OR
        cu.email LIKE ? OR
        cu.contact LIKE ? OR
        cu.department LIKE ? OR
        cu.role LIKE ?
      )`);
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    if (department) {
      conditions.push("cu.department = ?");
      params.push(department);
    }

    if (status !== "all") {
      conditions.push(`${statusExpression} = ?`);
      params.push(status);
    }

    const where = conditions.join(" AND ");
    const offset = (page - 1) * limit;

    const [rows] = await db.execute(
      `SELECT
        cu.id,
        cu.company_id,
        cu.name,
        cu.email,
        cu.contact AS phone,
        cu.department,
        cu.role,
        cu.date_of_joining,
        cu.dob,
        cu.reporting_manager,
        cu.ctc,
        cu.status AS employee_is_active,
        c.user_id AS customer_id,
        COALESCE(c.status, 0) AS customer_is_active,
        COALESCE(c.is_verified, 0) AS customer_is_verified,
        ${statusExpression} AS status,
        cu.created_at,
        cu.updated_at
       FROM company_users cu
       LEFT JOIN customer c ON c.company_user_id = cu.id
       WHERE ${where}
       ORDER BY cu.created_at DESC, cu.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const [[countRow]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM company_users cu
       LEFT JOIN customer c ON c.company_user_id = cu.id
       WHERE ${where}`,
      params,
    );

    return { rows, total: Number(countRow.total) };
  }

  async getStats(companyId) {
    const statusExpression = this.buildStatusExpression();
    const [[stats]] = await db.execute(
      `SELECT
        COUNT(*) AS total,
        SUM((${statusExpression}) = 'active') AS active,
        SUM((${statusExpression}) = 'pending') AS pending,
        SUM((${statusExpression}) = 'inactive') AS inactive
       FROM company_users cu
       LEFT JOIN customer c ON c.company_user_id = cu.id
       WHERE cu.company_id = ?`,
      [companyId],
    );

    return {
      total: Number(stats.total || 0),
      active: Number(stats.active || 0),
      pending: Number(stats.pending || 0),
      inactive: Number(stats.inactive || 0),
    };
  }

  async findById(employeeId, companyId, conn = db) {
    const statusExpression = this.buildStatusExpression();
    const [[employee]] = await conn.execute(
      `SELECT
        cu.id,
        cu.company_id,
        cu.name,
        cu.email,
        cu.contact AS phone,
        cu.address1,
        cu.address2,
        cu.department,
        cu.role,
        cu.date_of_joining,
        cu.dob,
        cu.reporting_manager,
        cu.ctc,
        cu.status AS employee_is_active,
        c.user_id AS customer_id,
        COALESCE(c.status, 0) AS customer_is_active,
        COALESCE(c.is_verified, 0) AS customer_is_verified,
        ${statusExpression} AS status,
        cu.created_at,
        cu.updated_at
       FROM company_users cu
       LEFT JOIN customer c ON c.company_user_id = cu.id
       WHERE cu.id = ? AND cu.company_id = ?
       LIMIT 1`,
      [employeeId, companyId],
    );
    return employee;
  }

  async findDuplicate({ email, phone, excludeId = null }, conn = db) {
    const conditions = [];
    const params = [];

    if (email) {
      conditions.push("LOWER(TRIM(email)) = ?");
      params.push(email.toLowerCase());
    }
    if (phone) {
      conditions.push("TRIM(contact) = ?");
      params.push(phone);
    }
    if (!conditions.length) return null;

    let exclusion = "";
    if (excludeId) {
      exclusion = "AND id != ?";
      params.push(excludeId);
    }

    const [[employee]] = await conn.execute(
      `SELECT id, name, email, contact
       FROM company_users
       WHERE (${conditions.join(" OR ")}) ${exclusion}
       LIMIT 1`,
      params,
    );
    return employee;
  }

  async create(data, conn = db) {
    const [result] = await conn.execute(
      `INSERT INTO company_users (
        company_id, name, date_of_joining, email, contact,
        address1, address2, role, dob, department,
        reporting_manager, ctc, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.company_id,
        data.name,
        data.date_of_joining || null,
        data.email || null,
        data.phone || null,
        data.address1 || null,
        data.address2 || null,
        data.role || null,
        data.dob || null,
        data.department || null,
        data.reporting_manager || null,
        data.ctc ?? null,
        data.status ?? 1,
      ],
    );
    return result.insertId;
  }

  async update(employeeId, companyId, data, conn = db) {
    await conn.execute(
      `UPDATE company_users
       SET name = ?, date_of_joining = ?, email = ?, contact = ?,
           address1 = ?, address2 = ?, role = ?, dob = ?,
           department = ?, reporting_manager = ?, ctc = ?
       WHERE id = ? AND company_id = ?`,
      [
        data.name,
        data.date_of_joining || null,
        data.email || null,
        data.phone || null,
        data.address1 || null,
        data.address2 || null,
        data.role || null,
        data.dob || null,
        data.department || null,
        data.reporting_manager || null,
        data.ctc ?? null,
        employeeId,
        companyId,
      ],
    );
  }

  async setStatus(employeeId, companyId, isActive, conn = db) {
    await conn.execute(
      `UPDATE company_users SET status = ? WHERE id = ? AND company_id = ?`,
      [isActive ? 1 : 0, employeeId, companyId],
    );
    await conn.execute(
      `UPDATE customer c
       INNER JOIN company_users cu ON cu.id = c.company_user_id
       SET c.status = ?
       WHERE cu.id = ? AND cu.company_id = ?`,
      [isActive ? 1 : 0, employeeId, companyId],
    );
  }

  async getExportRows(companyId) {
    const statusExpression = this.buildStatusExpression();
    const [rows] = await db.execute(
      `SELECT
        cu.id,
        cu.name,
        cu.email,
        cu.contact AS phone,
        cu.department,
        cu.role,
        cu.date_of_joining,
        cu.reporting_manager,
        cu.ctc,
        ${statusExpression} AS status,
        cu.created_at
       FROM company_users cu
       LEFT JOIN customer c ON c.company_user_id = cu.id
       WHERE cu.company_id = ?
       ORDER BY cu.created_at DESC`,
      [companyId],
    );
    return rows;
  }

  async getDashboard(companyId) {
    const [
      [summaryRows],
      [departments],
      [topEarners],
      [recentEmployees],
      [rewardTotals],
    ] =
      await Promise.all([
        db.execute(
          `SELECT
             COUNT(*) AS total_employees,
             SUM(cu.status = 1) AS active_employees,
             SUM(cu.status = 0) AS inactive_employees,
             SUM(c.user_id IS NULL) AS pending_onboarding,
             COUNT(DISTINCT NULLIF(TRIM(cu.department), '')) AS departments
           FROM company_users cu
           LEFT JOIN customer c ON c.company_user_id = cu.id
           WHERE cu.company_id = ?`,
          [companyId],
        ),
        db.execute(
          `SELECT
             COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS name,
             COUNT(*) AS count
           FROM company_users
           WHERE company_id = ?
           GROUP BY COALESCE(NULLIF(TRIM(department), ''), 'Unassigned')
           ORDER BY count DESC, name ASC`,
          [companyId],
        ),
        db.execute(
          `SELECT
             cu.id,
             c.user_id,
             cu.name,
             cu.role,
             cu.department,
             COALESCE(SUM(
               CASE WHEN wt.transaction_type = 'credit' THEN wt.coins ELSE 0 END
             ), 0) AS total_rewards
           FROM company_users cu
           INNER JOIN customer c ON c.company_user_id = cu.id
           LEFT JOIN wallet_transactions wt ON wt.user_id = c.user_id
           WHERE cu.company_id = ?
           GROUP BY cu.id, c.user_id, cu.name, cu.role, cu.department
           ORDER BY total_rewards DESC, cu.name ASC
           LIMIT 10`,
          [companyId],
        ),
        db.execute(
          `SELECT
             cu.id,
             c.user_id,
             cu.name,
             cu.email,
             cu.contact AS phone,
             cu.department,
             cu.role,
             CASE WHEN cu.status = 1 THEN 'active' ELSE 'inactive' END AS status,
             cu.created_at
           FROM company_users cu
           LEFT JOIN customer c ON c.company_user_id = cu.id
           WHERE cu.company_id = ?
           ORDER BY cu.created_at DESC, cu.id DESC
           LIMIT 5`,
          [companyId],
        ),
        db.execute(
          `SELECT COALESCE(SUM(wt.coins), 0) AS total_rewards
           FROM company_users cu
           INNER JOIN customer c ON c.company_user_id = cu.id
           INNER JOIN wallet_transactions wt ON wt.user_id = c.user_id
           WHERE cu.company_id = ?
             AND wt.transaction_type = 'credit'`,
          [companyId],
        ),
      ]);

    const summary = summaryRows[0] || {};
    return {
      summary: {
        total_employees: Number(summary.total_employees || 0),
        active_employees: Number(summary.active_employees || 0),
        inactive_employees: Number(summary.inactive_employees || 0),
        pending_onboarding: Number(summary.pending_onboarding || 0),
        departments: Number(summary.departments || 0),
      },
      department_distribution: departments.map((row) => ({
        name: row.name,
        count: Number(row.count),
      })),
      top_earners: topEarners.map((row) => ({
        ...row,
        total_rewards: Number(row.total_rewards || 0),
      })),
      total_rewards_distributed: Number(rewardTotals[0]?.total_rewards || 0),
      recent_employees: recentEmployees,
    };
  }
}

module.exports = new EmployeeModel();
