const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");

class ServiceSectionModel {
  async findByServiceId(serviceId) {
    const [rows] = await db.execute(
      `SELECT section_type, title, content
       FROM service_sections
       WHERE service_id = ? AND status = 1
       ORDER BY sort_order`,
      [serviceId],
    );

    return rows.map((r) => {
      let parsed = [];

      try {
        parsed = JSON.parse(r.content);
      } catch {
        parsed = [];
      }

      return {
        section_type: r.section_type,
        title: r.title,
        content: parsed,
      };
    });
  }
}

module.exports = new ServiceSectionModel();
