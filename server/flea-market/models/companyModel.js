const db = require("../../config/database");

class CompanyModel {
  async listActive() {
    const [rows] = await db.execute(
      `SELECT company_id, company_name FROM companies WHERE status = 1 ORDER BY company_name ASC`,
    );
    return rows;
  }
}

module.exports = new CompanyModel();
