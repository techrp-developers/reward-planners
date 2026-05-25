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
      sd.document_key,
      sd.is_mandatory,

      od.id AS order_document_id,
      od.file_path,
      od.uploaded

    FROM service_orders so

    LEFT JOIN service_documents sd 
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
      rows
        .filter((r) => r.service_document_id) 
        .map(async (r) => ({
          service_document_id: r.service_document_id,

          order_document_id: r.order_document_id,

          document_name: r.document_name,

          document_key: r.document_key,

          is_mandatory: Boolean(r.is_mandatory),

          uploaded: Boolean(r.uploaded),

          file_url: r.file_path ? await getPrivateFileUrl(r.file_path) : null,
        })),
    );
  }

  // Get required Docs by parent order id
  async getRequiredDocsByParentOrder(parentOrderId, userId) {
    const [rows] = await db.execute(
      `
    SELECT
      so.id AS service_order_id,
      so.status,

      s.id AS service_id,
      s.name AS service_name,

      sv.variant_name,

      sd.id AS service_document_id,
      sd.document_name,
      sd.document_key,
      sd.is_mandatory,

      od.id AS order_document_id,
      od.file_path,
      od.uploaded

    FROM service_orders so

    JOIN services s
      ON s.id = so.service_id

    LEFT JOIN service_variants sv
      ON sv.id = so.variant_id

    LEFT JOIN service_documents sd
      ON sd.service_id = so.service_id

    LEFT JOIN order_documents od
      ON od.service_document_id = sd.id
      AND od.order_id = so.id

    WHERE so.parent_order_id = ?
    AND so.user_id = ?

    ORDER BY so.id ASC, sd.id ASC
    `,
      [parentOrderId, userId],
    );

    const orderMap = {};

    for (const row of rows) {
      // create service item
      if (!orderMap[row.service_order_id]) {
        orderMap[row.service_order_id] = {
          service_order_id: row.service_order_id,

          service_id: row.service_id,

          service_name: row.service_name,

          variant_name: row.variant_name,

          status: row.status,

          documents: [],
        };
      }

      if (row.service_document_id) {
        orderMap[row.service_order_id].documents.push({
          service_document_id: row.service_document_id,
          order_document_id: row.order_document_id,
          document_name: row.document_name,
          document_key: row.document_key,
          is_mandatory: Boolean(row.is_mandatory),
          uploaded: Boolean(row.uploaded),
          file_url: row.file_path
            ? await getPrivateFileUrl(row.file_path)
            : null,
        });
      }
    }

    return {
      parent_order_id: parentOrderId,

      items: Object.values(orderMap),
    };
  }
}

module.exports = new ServiceOrderDocumentModel();
