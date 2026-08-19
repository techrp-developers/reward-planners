const db = require("../../config/database");

class CustomerModel {
  // Tenant-scoped: always filters by company_id — never search across companies.
  async search(companyId, query, limit) {
    const like = `%${query}%`;
    const [rows] = await db.execute(
      `SELECT c.user_id, c.name, c.email, c.phone
       FROM customer c
       WHERE (
           c.company_id = ?
           OR EXISTS (
             SELECT 1 FROM company_users cu
             WHERE cu.id = c.company_user_id AND cu.company_id = ?
           )
         )
         AND c.status = 1
         AND (c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)
       LIMIT ?`,
      [companyId, companyId, like, like, like, limit],
    );
    return rows;
  }

  async findByIdAndCompany(userId, companyId) {
    const [rows] = await db.execute(
      `SELECT c.user_id, c.company_id, c.name, c.email, c.phone, c.status, c.is_verified
       FROM customer c
       WHERE c.user_id = ?
         AND (
           c.company_id = ?
           OR EXISTS (
             SELECT 1 FROM company_users cu
             WHERE cu.id = c.company_user_id AND cu.company_id = ?
           )
         )`,
      [userId, companyId, companyId],
    );
    return rows[0];
  }
}

module.exports = new CustomerModel();
