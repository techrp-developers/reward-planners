const db = require("../../../../config/database");
const { getPrivateFileUrl } = require("../../../../utils/r2SignedUrl");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class ServiceOrderDocumentModel {
  async upload(data) {
    await db.execute(
      `INSERT INTO order_documents
    (order_id, service_document_id, file_path,uploaded)
    VALUES (?, ?, ?, 1)`,
      [data.order_id, data.document_id, data.file_path],
    );
  }

  // upload or update document
  async uploadOrUpdate(data) {
    // check if already exists
    const [existing] = await db.execute(
      `SELECT id FROM order_documents 
     WHERE order_id = ? AND service_document_id = ?`,
      [data.order_id, data.document_id],
    );

    if (existing.length) {
      await db.execute(
        `UPDATE order_documents 
       SET file_path = ?,uploaded = 1 
       WHERE id = ?`,
        [data.file_path, existing[0].id],
      );
    } else {
      await db.execute(
        `INSERT INTO order_documents 
      (order_id, service_document_id, file_path, uploaded)
      VALUES (?, ?, ?, 1)`,
        [data.order_id, data.document_id, data.file_path],
      );
    }
  }

  // Get required Docs
  async getRequiredDocs(orderId) {
    const [rows] = await db.execute(
      `
    SELECT
      sd.id AS service_document_id,
      sd.document_name,
      sd.is_mandatory,

      od.id AS order_document_id,
      od.file_path,
      od.uploaded

    FROM service_orders so
    JOIN service_documents sd 
      ON sd.service_id = so.service_id

    LEFT JOIN order_documents od 
      ON od.service_document_id = sd.id
      AND od.order_id = so.id

    WHERE so.id = ?
    ORDER BY sd.id
    `,
      [orderId],
    );

    return await Promise.all(
      rows.map(async (r) => {
        return {
          service_document_id: r.service_document_id,
          document_name: r.document_name,
          is_mandatory: r.is_mandatory,
          uploaded: r.uploaded === 1,
          file_url: r.file_path ? await getPrivateFileUrl(r.file_path) : null,
        };
      }),
    );
  }
}

module.exports = new ServiceOrderDocumentModel();
