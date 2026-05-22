const db = require("../../../../config/database");

class ServiceEnquiryModel {
  async create(data) {
    const [result] = await db.execute(
      `INSERT INTO service_enquiries
      (service_id,bundle_id,variant_id, user_id, name, city, mobile, email, enquiry_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.service_id,
        data.bundle_id,
        data.variant_id,
        data.user_id,
        data.name,
        data.city || null,
        data.mobile,
        data.email || null,
        JSON.stringify(data.enquiry_data || {}),
      ],
    );

    const insertId = result.insertId;
    const ref = `SP-ENQ-${1000 + insertId}`;

    await db.execute(
      `UPDATE service_enquiries SET enquiry_ref = ? WHERE id = ?`,
      [ref, insertId],
    );

    return {
      id: insertId,
      enquiry_ref: ref,
    };
  }

  // All the Enquiries
  async findAll() {
    const [rows] = await db.execute(
      `
    SELECT
      se.id,
      se.enquiry_ref,
      se.bundle_id,
      se.name,
      se.city,
      se.mobile,
      se.email,
      se.status,
      se.enquiry_data,
      se.created_at,

      s.name AS service_name,

      sv.variant_name AS variant_name,
      sv.title AS variant_title

    FROM service_enquiries se
    JOIN services s ON s.id = se.service_id
    LEFT JOIN service_variants sv ON sv.id = se.variant_id
    ORDER BY se.created_at DESC
    `,
    );

    return rows.map((r) => {
      let parsedData = {};
      try {
        parsedData = r.enquiry_data ? JSON.parse(r.enquiry_data) : {};
      } catch (e) {
        parsedData = {};
      }

      return {
        ...r,
        enquiry_data: parsedData,
      };
    });
  }

  // Get Enquiry By Id
  async findById(id) {
    const [rows] = await db.execute(
      `
    SELECT 
      se.id,
      se.enquiry_ref,
      se.bundle_id,
      se.name,
      se.city,
      se.mobile,
      se.email,
      se.status,
      se.enquiry_data,
      se.created_at,
      s.name AS service_name,
      sv.variant_name AS variant_name,
      sv.title as variant_title
    FROM service_enquiries se
    JOIN services s ON s.id = se.service_id
    LEFT JOIN service_variants sv ON sv.id = se.variant_id
    WHERE se.id = ?
    `,
      [id],
    );

    if (!rows.length) return null;

    const r = rows[0];
    let parsedData = {};

    try {
      parsedData = r.enquiry_data ? JSON.parse(r.enquiry_data) : {};
    } catch (e) {
      parsedData = {};
    }

    return {
      ...r,
      enquiry_data: parsedData,
    };
  }
}

module.exports = new ServiceEnquiryModel();
