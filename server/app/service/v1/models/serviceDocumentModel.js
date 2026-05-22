const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");

class ServiceDocumentModel {
  // create
  async create(data) {
    const [result] = await db.execute(
      `INSERT INTO service_documents (service_id, document_name, is_mandatory)
       VALUES (?, ?, ?)`,
      [data.service_id, data.document_name, data.is_mandatory ?? 1],
    );
    return result.insertId;
  }

  //   fetch by id
  async findByServiceId(serviceId) {
    const [rows] = await db.execute(
      `SELECT id, document_name, is_mandatory
       FROM service_documents
       WHERE service_id = ?`,
      [serviceId],
    );
    return rows;
  }

  // active documents by service id
  async findActiveByServiceId(serviceId) {
    const [rows] = await db.execute(
      `SELECT id, document_name, is_mandatory
     FROM service_documents
     WHERE service_id = ?`,
      [serviceId],
    );
    return rows;
  }

  //   delete
  async delete(id) {
    const [result] = await db.execute(
      `DELETE FROM service_documents WHERE id = ?`,
      [id],
    );
    return result.affectedRows;
  }
}

module.exports = new ServiceDocumentModel();
