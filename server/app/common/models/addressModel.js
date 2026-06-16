const db = require("../../../config/database");
const fs = require("fs");
const path = require("path");

class AddressModel {
  // Fetch Countries
  async getAllCountries() {
    const [rows] = await db.execute(
      `SELECT 
         country_id,
         country_name,
         country_code
       FROM countries
       WHERE status = 1
       ORDER BY country_name`,
    );

    return rows;
  }

  // Fetch States
  async getAllStates() {
    const [rows] = await db.execute(
      `SELECT 
         state_id,
         state_name
       FROM states
       WHERE status = 1
       ORDER BY state_name`,
    );

    return rows;
  }

  // Fetch States by Country ID
  async getStatesByCountry(countryId) {
    const [rows] = await db.execute(
      `SELECT 
         state_id,
         state_name
       FROM states
       WHERE country_id = ? AND status = 1
       ORDER BY state_name`,
      [countryId],
    );

    return rows;
  }

  // add address
  async addAddress(data, conn = db) {
    // helper to prevent mysql undefined error
    const safe = (val) => (val === undefined ? null : val);

    const {
      user_id,
      address_type,
      is_default,
      address1,
      address2,
      city,
      zipcode,
      state_id,
      landmark,
      contact_name,
      contact_phone,
      latitude,
      longitude,
    } = data;

    const [result] = await conn.execute(
      `INSERT INTO customer_addresses (
      user_id, 
      address_type, 
      is_default, 
      address1, 
      address2, 
      city, 
      zipcode, 
      country_id, 
      state_id, 
      landmark, 
      contact_name, 
      contact_phone, 
      latitude, 
      longitude
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 75, ?, ?, ?, ?, ?, ?)`,
      [
        safe(user_id),
        safe(address_type),
        safe(is_default ?? 0),
        safe(address1),
        safe(address2),
        safe(city),
        safe(zipcode),
        safe(state_id),
        safe(landmark),
        safe(contact_name),
        safe(contact_phone),
        safe(latitude),
        safe(longitude),
      ],
    );

    return result.insertId;
  }

  // Count default addresses
  async countDefault(userId, conn = db) {
    const [rows] = await conn.execute(
      `SELECT COUNT(*) as count 
     FROM customer_addresses 
     WHERE user_id = ? AND is_default = 1`,
      [userId],
    );
    return rows[0].count;
  }

  // count user address
  async hasAnyAddress(userId, conn = db) {
    const [rows] = await conn.execute(
      `SELECT 1 
     FROM customer_addresses 
     WHERE user_id = ? 
     LIMIT 1`,
      [userId],
    );

    return rows.length > 0;
  }

  //   clear Default Address
  async clearDefault(userId, conn = db) {
    await conn.execute(
      `UPDATE customer_addresses
       SET is_default = 0
       WHERE user_id = ?`,
      [userId],
    );
  }

  //   Update address
  async updateAddress(addressId, userId, data, conn = db) {
    const {
      address_type = null,
      is_default = null,
      address1 = null,
      address2 = null,
      city = null,
      zipcode = null,
      state_id = null,
      landmark = null,
      contact_name = null,
      contact_phone = null,
      latitude = null,
      longitude = null,
    } = data;

    const query = `
    UPDATE customer_addresses SET
      address_type = ?,
      is_default = ?,
      address1 = ?,
      address2 = ?,
      city = ?,
      zipcode = ?,
      state_id = ?,
      landmark = ?,
      contact_name = ?,
      contact_phone = ?,
      latitude = ?,
      longitude = ?
    WHERE address_id = ? AND user_id = ?
  `;

    const values = [
      address_type ?? null,
      is_default ?? null,
      address1 ?? null,
      address2 ?? null,
      city ?? null,
      zipcode ?? null,
      state_id ?? null,
      landmark ?? null,
      contact_name ?? null,
      contact_phone ?? null,
      latitude ?? null,
      longitude ?? null,
      addressId,
      userId,
    ];

    const [result] = await conn.execute(query, values);

    return result.affectedRows;
  }

  //   Delete address
  async deleteAddress(addressId, userId) {
    const [result] = await db.execute(
      `DELETE FROM customer_addresses
       WHERE address_id = ? AND user_id = ?`,
      [addressId, userId],
    );

    return result.affectedRows;
  }

  //   Fetch address by user
  async getAddressesByUser(userId) {
  const [rows] = await db.execute(
    `SELECT ca.*, s.state_name AS state
     FROM customer_addresses ca
     LEFT JOIN states s ON ca.state_id = s.state_id
     WHERE ca.user_id = ? 
       AND ca.status = 1
     ORDER BY ca.is_default DESC, ca.created_at DESC`,
    [userId],
  );

  return rows;
}

  //   Fetch address by ID
  async getAddressById(addressId, userId, conn = db) {
    const [rows] = await conn.execute(
      `SELECT ca.*, s.state_name as state
     FROM customer_addresses ca
     LEFT JOIN states s ON ca.state_id = s.state_id
     WHERE ca.address_id = ? 
       AND ca.user_id = ?`,
      [addressId, userId],
    );

    return rows[0];
  }
}

module.exports = new AddressModel();
