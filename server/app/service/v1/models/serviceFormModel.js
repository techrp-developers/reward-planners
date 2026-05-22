const db = require("../../../../config/database");

class ServiceFormModel {
  // find by service Id
  async findFormByServiceId(serviceId) {
    const [rows] = await db.execute(
      `SELECT label, field_name, field_type, options, is_required
     FROM service_enquiry_fields
     WHERE service_id = ?
     ORDER BY sort_order`,
      [serviceId],
    );

    return rows.map((r) => ({
      ...r,
      options: r.options ? JSON.parse(r.options) : null,
    }));
  }

  // find by bundle Id
  async findFormByBundleId(bundleId) {
    if (!bundleId) {
      throw new Error("bundle_id is required");
    }

    const [rows] = await db.execute(
      `
      SELECT 
        label,
        field_name,
        field_type,
        options,
        is_required
      FROM service_enquiry_fields
      WHERE bundle_id = ?
      ORDER BY sort_order
      `,
      [bundleId],
    );

    return rows.map((r) => ({
      ...r,
      options: r.options ? JSON.parse(r.options) : null,
    }));
  }
}

module.exports = new ServiceFormModel();
