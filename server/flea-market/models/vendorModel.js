const db = require("../../config/database");

class VendorModel {
  async search(query, limit) {
    const like = `%${query}%`;
    const [rows] = await db.execute(
      `SELECT vendor_id, company_name, full_name, status
       FROM vendors
       WHERE status = 'approved' AND (company_name LIKE ? OR full_name LIKE ?)
       ORDER BY company_name ASC
       LIMIT ?`,
      [like, like, limit],
    );
    return rows;
  }

  async findByEmail(email, conn = db) {
    const [rows] = await conn.execute(`SELECT user_id FROM eusers WHERE email = ?`, [email]);
    return rows[0];
  }

  // Quick-create path: a flea market vendor still needs a backing eusers row
  // (vendors.user_id is NOT NULL + UNIQUE, FK'd to eusers) — there's no
  // "vendor with no login" shape in this schema, so one is created alongside.
  async create({ companyName, fullName, email, phone }, conn) {
    const [userResult] = await conn.execute(
      `INSERT INTO eusers (name, role, email, phone, is_verified) VALUES (?, 'vendor', ?, ?, 0)`,
      [fullName, email, phone || null],
    );
    const userId = userResult.insertId;

    const [vendorResult] = await conn.execute(
      `INSERT INTO vendors (user_id, company_name, full_name, status, onboarding_flag)
       VALUES (?, ?, ?, 'approved', 1)`,
      [userId, companyName, fullName],
    );

    return { vendorId: vendorResult.insertId, userId };
  }
}

module.exports = new VendorModel();
