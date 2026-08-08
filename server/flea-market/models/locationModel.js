const db = require("../../config/database");

class LocationModel {
  async findActiveByCompany(companyId) {
    const [rows] = await db.execute(
      `SELECT location_id, company_id, name, address, status
       FROM flea_market_locations
       WHERE company_id = ? AND status = 'active'
       ORDER BY name ASC`,
      [companyId],
    );
    return rows;
  }

  // The location record is the authoritative source of company_id for pre-session OTP requests.
  async findActiveById(locationId) {
    const [rows] = await db.execute(
      `SELECT location_id, company_id, name, address, status
       FROM flea_market_locations
       WHERE location_id = ? AND status = 'active'`,
      [locationId],
    );
    return rows[0];
  }

  async findByIdAndCompany(locationId, companyId) {
    const [rows] = await db.execute(
      `SELECT location_id, company_id, name, address, status
       FROM flea_market_locations
       WHERE location_id = ? AND company_id = ?`,
      [locationId, companyId],
    );
    return rows[0];
  }

  // Case-insensitive match so retyping an existing location's name reuses it
  // instead of creating a duplicate row.
  async findActiveByNameAndCompany(companyId, name) {
    const [rows] = await db.execute(
      `SELECT location_id, company_id, name, address, status
       FROM flea_market_locations
       WHERE company_id = ? AND status = 'active' AND LOWER(name) = LOWER(?)`,
      [companyId, name],
    );
    return rows[0];
  }

  async create({ companyId, name, address }) {
    const [result] = await db.execute(
      `INSERT INTO flea_market_locations (company_id, name, address, status)
       VALUES (?, ?, ?, 'active')`,
      [companyId, name, address || null],
    );
    return result.insertId;
  }
}

module.exports = new LocationModel();
