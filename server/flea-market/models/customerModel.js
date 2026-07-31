const db = require("../../config/database");

class CustomerModel {
  // Tenant-scoped: always filters by company_id — never search across companies.
  async search(companyId, query, limit) {
    const like = `%${query}%`;
    const [rows] = await db.execute(
      `SELECT user_id, name, email, phone
       FROM customer
       WHERE company_id = ?
         AND status = 1
         AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)
       LIMIT ?`,
      [companyId, like, like, like, limit],
    );
    return rows;
  }

  async findByIdAndCompany(userId, companyId) {
    const [rows] = await db.execute(
      `SELECT user_id, company_id, name, email, phone, status, is_verified
       FROM customer
       WHERE user_id = ? AND company_id = ?`,
      [userId, companyId],
    );
    return rows[0];
  }
}

module.exports = new CustomerModel();
