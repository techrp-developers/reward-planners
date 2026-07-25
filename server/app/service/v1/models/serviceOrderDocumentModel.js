const db = require("../../../../config/database");
const { getPrivateFileUrl } = require("../../../../utils/r2SignedUrl");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class ServiceOrderDocumentModel {
  // upload or update parent order document
  async uploadOrUpdateParentDocument(data) {
    const [existing] = await db.execute(
      `
    SELECT id
    FROM parent_order_documents
    WHERE parent_order_id = ?
    AND document_key = ?
    `,
      [data.parent_order_id, data.document_key],
    );

    if (existing.length) {
      await db.execute(
        `
      UPDATE parent_order_documents
      SET
        file_path = ?,
        uploaded = 1,
        uploaded_at = NOW()
      WHERE id = ?
      `,
        [data.file_path, existing[0].id],
      );

      return existing[0].id;
    }

    const [result] = await db.execute(
      `
    INSERT INTO parent_order_documents
    (
      parent_order_id,
      document_key,
      file_path,
      uploaded
    )
    VALUES
    (
      ?, ?, ?, 1
    )
    `,
      [data.parent_order_id, data.document_key, data.file_path],
    );

    return result.insertId;
  }

  async getRequiredDocs(orderId, userId) {
    const [rows] = await db.execute(
      `
    SELECT
      sd.id AS service_document_id,
      sd.document_name,
      sd.document_key,
      sd.is_mandatory,
      sd.is_expirable,

      pod.id AS parent_document_id,
      pod.file_path,
      pod.uploaded,
      pod.expiry_date,
      pod.document_number

    FROM service_orders so

    LEFT JOIN service_documents sd
      ON sd.service_id = so.service_id

    LEFT JOIN parent_order_documents pod
      ON pod.parent_order_id = so.parent_order_id
      AND pod.document_key = sd.document_key

    WHERE so.id = ?
    AND so.user_id = ?

    ORDER BY sd.id
    `,
      [orderId, userId],
    );

    return await Promise.all(
      rows
        .filter((r) => r.service_document_id)
        .map(async (r) => ({
          service_document_id: r.service_document_id,

          uploaded_document_id: r.parent_document_id,

          document_name: r.document_name,

          document_key: r.document_key,

          is_mandatory: Boolean(r.is_mandatory),

          is_expirable: Boolean(r.is_expirable),

          uploaded: Boolean(r.uploaded),

          expiry_date: r.expiry_date,

          document_number: r.document_number,

          file_url: r.file_path ? await getPrivateFileUrl(r.file_path) : null,
        })),
    );
  }

  // Get required Docs by parent order id
  async getRequiredDocsByParentOrder(parentOrderId, userId) {
    const [rows] = await db.execute(
      `
    SELECT DISTINCT

      sd.document_key,
      sd.document_name,
      sd.is_mandatory,
      sd.is_expirable,

      pod.id AS parent_document_id,
      pod.file_path,
      pod.uploaded,
      pod.expiry_date,
      pod.document_number

    FROM service_orders so

    JOIN service_documents sd
      ON sd.service_id = so.service_id

    LEFT JOIN parent_order_documents pod
      ON pod.parent_order_id = so.parent_order_id
      AND pod.document_key = sd.document_key

    WHERE so.parent_order_id = ?
    AND so.user_id = ?

    ORDER BY sd.document_name
    `,
      [parentOrderId, userId],
    );

    const documents = await Promise.all(
      rows.map(async (row) => ({
        document_key: row.document_key,

        document_name: row.document_name,

        is_mandatory: Boolean(row.is_mandatory),

        is_expirable: Boolean(row.is_expirable),

        uploaded: Boolean(row.uploaded),

        expiry_date: row.expiry_date,

        document_number: row.document_number,

        file_url: row.file_path ? await getPrivateFileUrl(row.file_path) : null,
      })),
    );

    const mandatoryDocs = documents.filter((d) => d.is_mandatory);

    return {
      parent_order_id: parentOrderId,

      can_submit:
        mandatoryDocs.length === 0 || mandatoryDocs.every((d) => d.uploaded),

      documents,
    };
  }

  // Get the documents submitted by a customer for an admin order view.
  async getUploadedDocsByParentOrderAdmin(parentOrderId) {
    const [rows] = await db.execute(
      `
      SELECT
        pod.id,
        pod.document_key,
        pod.file_path,
        pod.uploaded,
        pod.uploaded_at,
        pod.expiry_date,
        pod.document_number,
        MAX(sd.document_name) AS document_name,
        MAX(sd.is_mandatory) AS is_mandatory,
        MAX(sd.is_expirable) AS is_expirable
      FROM parent_order_documents pod
      LEFT JOIN service_orders so
        ON so.parent_order_id = pod.parent_order_id
      LEFT JOIN service_documents sd
        ON sd.service_id = so.service_id
        AND sd.document_key = pod.document_key
      WHERE pod.parent_order_id = ?
        AND pod.uploaded = 1
      GROUP BY
        pod.id,
        pod.document_key,
        pod.file_path,
        pod.uploaded,
        pod.uploaded_at,
        pod.expiry_date,
        pod.document_number
      ORDER BY document_name, pod.document_key
      `,
      [parentOrderId],
    );

    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        document_key: row.document_key,
        document_name: row.document_name || row.document_key,
        is_mandatory: Boolean(row.is_mandatory),
        is_expirable: Boolean(row.is_expirable),
        uploaded: Boolean(row.uploaded),
        uploaded_at: row.uploaded_at,
        expiry_date: row.expiry_date,
        document_number: row.document_number,
        file_url: row.file_path ? await getPrivateFileUrl(row.file_path) : null,
      })),
    );
  }
}

module.exports = new ServiceOrderDocumentModel();
