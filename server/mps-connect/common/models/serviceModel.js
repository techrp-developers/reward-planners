const db = require("../../../config/database");
const fs = require("fs");
const path = require("path");
const { getPrivateFileUrl } = require("../../../utils/r2SignedUrl");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

function mapServiceCancelEvent(event) {
  const eventMap = {
    cancellation_requested: "Cancellation Requested",

    cancellation_approved: "Cancellation Approved",

    cancellation_rejected: "Cancellation Rejected",

    refund_initiated: "Refund Initiated",

    refund_completed: "Refund Completed",

    refund_failed: "Refund Failed",
  };

  return eventMap[event] || event;
}

class ServiceModel {
  async createEnquiry(data) {
    const [result] = await db.execute(
      `INSERT INTO external_service_enquiries
      (client_id,service_id,bundle_id,variant_id, user_id, name, city, mobile, email, enquiry_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.apiClientId,
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
    const ref = `EXT-SP-ENQ-${1000 + insertId}`;

    await db.execute(
      `UPDATE external_service_enquiries SET enquiry_ref = ? WHERE id = ?`,
      [ref, insertId],
    );

    return {
      id: insertId,
      enquiry_ref: ref,
    };
  }

  // get or create cart item
  async getOrCreateCart(userId, apiClientId) {
    const [rows] = await db.execute(
      `SELECT * FROM external_service_cart 
     WHERE user_id = ? AND client_id= ? AND status = 'active'
     ORDER BY id DESC 
     LIMIT 1`,
      [userId, apiClientId],
    );

    if (rows.length) return rows[0];

    const [result] = await db.execute(
      `INSERT INTO external_service_cart (user_id, client_id, status) VALUES (?, ?,'active')`,
      [userId, apiClientId],
    );

    return { id: result.insertId, user_id: userId };
  }

  // add item to cart
  async addItem(cartId, data) {
    // check if same variant already exists
    const [existing] = await db.execute(
      `SELECT id FROM external_service_cart_items 
       WHERE cart_id = ? AND variant_id = ?`,
      [cartId, data.variant_id],
    );

    if (existing.length) {
      return;
    }

    await db.execute(
      `INSERT INTO external_service_cart_items
      (cart_id, service_id, variant_id, price, quantity, bundle_id)
      VALUES (?, ?, ?, ?, 1, ?)`,
      [
        cartId,
        data.service_id,
        data.variant_id,
        data.price,
        data.bundle_id || null,
      ],
    );
  }

  // get cart items
  async getCart(cartId) {
    const [rows] = await db.execute(
      `
      SELECT 
        ci.id,
        ci.quantity,
        ci.price,
        ci.bundle_id,

        s.name AS service_name,
        sv.variant_name,
        sv.id as variant_id,
        sv.service_id,
        sv.title,
        sv.image_url,

        sd.id as document_id,
        sd.document_name,
        sd.is_mandatory

      FROM external_service_cart_items ci
      JOIN services s ON s.id = ci.service_id
      JOIN service_variants sv ON sv.id = ci.variant_id
      LEFT JOIN service_documents sd ON sd.service_id = s.id

      WHERE ci.cart_id = ?
      `,
      [cartId],
    );

    const itemMap = {};
    const bundles = {};

    rows.forEach((item) => {
      const itemId = item.id;

      // build item
      if (!itemMap[itemId]) {
        itemMap[itemId] = {
          id: item.id,
          quantity: item.quantity,
          price: Number(item.price),
          bundle_id: item.bundle_id,

          service_name: item.service_name,
          variant_name: item.variant_name,
          variant_id: item.variant_id,
          service_id: item.service_id,
          title: item.title,
          image_url: getPublicUrl(item.image_url),

          documents: [],
        };
      }

      if (item.document_id) {
        const exists = itemMap[itemId].documents.find(
          (d) => d.id === item.document_id,
        );

        if (!exists) {
          itemMap[itemId].documents.push({
            id: item.document_id,
            document_name: item.document_name,
            is_mandatory: item.is_mandatory,
          });
        }
      }
    });

    //  Group into bundles
    const individual_items = [];

    Object.values(itemMap).forEach((item) => {
      if (item.bundle_id) {
        if (!bundles[item.bundle_id]) {
          bundles[item.bundle_id] = {
            bundle_id: item.bundle_id,
            items: [],
            bundle_total: 0,
          };
        }

        bundles[item.bundle_id].items.push(item);
        bundles[item.bundle_id].bundle_total += Number(item.price);
      } else {
        individual_items.push(item);
      }
    });

    return {
      bundles: Object.values(bundles),
      individual_items,
    };
  }

  // remove item from cart
  async removeItem(itemId, cartId) {
    const [[item]] = await db.execute(
      `SELECT cart_id, bundle_id 
     FROM external_service_cart_items 
     WHERE id = ? AND cart_id = ?`,
      [itemId, cartId],
    );

    // item does not belong to this cart
    if (!item) return false;

    // if bundle item remove entire bundle from same cart
    if (item.bundle_id) {
      await db.execute(
        `DELETE FROM external_service_cart_items
       WHERE cart_id = ? AND bundle_id = ?`,
        [cartId, item.bundle_id],
      );
    } else {
      await db.execute(
        `DELETE FROM external_service_cart_items
       WHERE id = ? AND cart_id = ?`,
        [itemId, cartId],
      );
    }

    return true;
  }

  // clear cart
  async clearCart(cartId) {
    await db.execute(
      `DELETE FROM external_service_cart_items WHERE cart_id = ?`,
      [cartId],
    );
  }

  // create order
  async createOrder(data) {
    const [result] = await db.execute(
      `INSERT INTO external_service_orders
    (client_id, user_id, service_id, variant_id, address_id, enquiry_id, price, parent_order_id, bundle_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.apiClientId,
        data.user_id,
        data.service_id,
        data.variant_id,
        data.addressId,
        data.enquiry_id,
        data.price,
        data.parent_order_id,
        data.bundle_id || null,
        data.status,
      ],
    );

    const insertId = result.insertId;
    const ref = `SP-ORD-${1000 + insertId}`;

    await db.execute(
      `UPDATE external_service_orders SET order_ref = ? WHERE id = ?`,
      [ref, insertId],
    );

    return {
      id: insertId,
      order_ref: ref,
    };
  }

  // =========================================Order info==================================
  // get my orders
  async getUserOrders(userId, status = null) {
    let sql = `
    SELECT 
      so.id,
      so.order_ref,
      so.price,
      so.status,
      so.created_at,
      so.parent_order_id,
      so.bundle_id,

      s.name AS service_name,
      sv.variant_name,
      sv.image_url

    FROM external_service_orders so
    JOIN services s ON s.id = so.service_id
    LEFT JOIN service_variants sv ON sv.id = so.variant_id

    WHERE so.user_id = ?
  `;

    const params = [userId];

    if (status && status !== "all") {
      sql += ` AND so.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY so.created_at DESC`;

    const [rows] = await db.execute(sql, params);

    const ordersMap = {};

    rows.forEach((row) => {
      const parentId = row.parent_order_id;

      if (!ordersMap[parentId]) {
        ordersMap[parentId] = {
          parent_order_id: parentId,
          created_at: row.created_at,
          total_amount: 0,

          //  FIX: store all statuses
          statuses: [],

          // final structure
          status: null,
          items: [],
          bundles: {},
          summary: {
            total_items: 0,
            total_bundles: 0,
          },
          preview: [],
        };
      }

      const order = ordersMap[parentId];

      // collect statuses
      order.statuses.push(row.status);

      const item = {
        id: row.id,
        order_ref: row.order_ref,
        service_name: row.service_name,
        variant_name: row.variant_name,
        image_url: row.image_url ? getPublicUrl(row.image_url) : null,
        price: Number(row.price),
        bundle_id: row.bundle_id,
      };

      //  bundle grouping
      if (row.bundle_id) {
        if (!order.bundles[row.bundle_id]) {
          order.bundles[row.bundle_id] = {
            bundle_id: row.bundle_id,
            items: [],
            bundle_total: 0,
          };

          // summary
          order.summary.total_bundles += 1;

          // preview (bundle)
          order.preview.push({
            type: "bundle",
            name: `Bundle #${row.bundle_id}`,
          });
        }

        order.bundles[row.bundle_id].items.push(item);
        order.bundles[row.bundle_id].bundle_total += Number(row.price);
      } else {
        order.items.push(item);

        // preview (service)
        order.preview.push({
          type: "service",
          name: row.service_name,
        });
      }

      order.summary.total_items += 1;
      order.total_amount += Number(row.price);
    });

    //  FINAL TRANSFORM
    const result = Object.values(ordersMap).map((order) => {
      //  aggregate status
      let finalStatus = "pending_payment";

      if (order.statuses.every((s) => s === "completed")) {
        finalStatus = "completed";
      } else if (order.statuses.some((s) => s === "in_progress")) {
        finalStatus = "in_progress";
      } else if (order.statuses.some((s) => s === "documents_pending")) {
        finalStatus = "documents_pending";
      }

      return {
        parent_order_id: order.parent_order_id,
        created_at: order.created_at,
        status: finalStatus,
        total_amount: order.total_amount,

        items: order.items,
        bundles: Object.values(order.bundles),

        summary: order.summary,
        preview: order.preview.slice(0, 3),
      };
    });

    //  SORT (latest first)
    result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return result;
  }

  // order detail by Id
  async getOrderByParentId(apiClientId, orderId, userId) {
    const parentId = orderId;

    // fetch all items of this order
    const [rows] = await db.execute(
      `
    SELECT 
      so.id,
      so.order_ref,
      so.price,
      so.status,
      so.bundle_id,
      so.created_at,

      s.name AS service_name,
      sv.variant_name,
      sv.title,
      sv.image_url

    FROM external_service_orders so
    JOIN services s ON s.id = so.service_id
    LEFT JOIN service_variants sv ON sv.id = so.variant_id

    WHERE so.parent_order_id = ? AND so.user_id = ? AND so.client_id = ?
    `,
      [parentId, userId, apiClientId],
    );

    if (!rows.length) return null;

    // Aggregate status
    const statuses = rows.map((r) => r.status);

    let finalStatus = "pending_payment";

    if (statuses.every((s) => s === "completed")) {
      finalStatus = "completed";
    } else if (statuses.some((s) => s === "in_progress")) {
      finalStatus = "in_progress";
    } else if (statuses.some((s) => s === "documents_pending")) {
      finalStatus = "documents_pending";
    }

    const response = {
      parent_order_id: parentId,
      status: finalStatus,
      created_at: rows[0].created_at,
      items: [],
      bundles: {},
      total_amount: 0,
    };

    rows.forEach((row) => {
      const item = {
        id: row.id,
        order_ref: row.order_ref,
        service_name: row.service_name,
        variant_name: row.variant_name,
        title: row.title,
        image_url: row.image_url ? getPublicUrl(row.image_url) : null,
        price: Number(row.price),
        status: row.status,
      };

      if (row.bundle_id) {
        if (!response.bundles[row.bundle_id]) {
          response.bundles[row.bundle_id] = {
            bundle_id: row.bundle_id,
            items: [],
            bundle_total: 0,
          };
        }

        response.bundles[row.bundle_id].items.push(item);
        response.bundles[row.bundle_id].bundle_total += Number(row.price);
      } else {
        response.items.push(item);
      }

      response.total_amount += Number(row.price);
    });

    response.bundles = Object.values(response.bundles);

    return response;
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
      sd.is_expirable,

      pod.id AS parent_document_id,
      pod.file_path,
      pod.uploaded,
      pod.expiry_date,
      pod.document_number

    FROM external_service_orders so

    LEFT JOIN service_documents sd
      ON sd.service_id = so.service_id

    LEFT JOIN external_parent_order_documents pod
      ON pod.parent_order_id = so.parent_order_id
      AND pod.document_key = sd.document_key

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

    FROM external_service_orders so

    JOIN service_documents sd
      ON sd.service_id = so.service_id

    LEFT JOIN external_parent_order_documents pod
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

  // upload or update parent order document
  async uploadOrUpdateParentDocument(data) {
    const [existing] = await db.execute(
      `
    SELECT id
    FROM external_parent_order_documents
    WHERE parent_order_id = ?
    AND document_key = ?
    `,
      [data.parent_order_id, data.document_key],
    );

    if (existing.length) {
      await db.execute(
        `
      UPDATE external_parent_order_documents
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
    INSERT INTO external_parent_order_documents
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

  // Update document status
  async updateStatus(orderId, status) {
    let sql = `
    UPDATE external_service_orders
    SET status = ?
  `;

    const params = [status];

    // completed
    if (status === "completed") {
      sql += `, completed_at = NOW()`;
    }

    // cancelled
    if (status === "cancelled") {
      sql += `, cancelled_at = NOW()`;
    }

    sql += ` WHERE id = ?`;

    params.push(orderId);

    const [result] = await db.execute(sql, params);

    return result.affectedRows;
  }

  // Cancellation Details
  async getCancellationDetails({ userId, serviceOrderId }) {
    // =====================================
    // Order details
    // =====================================

    const [[order]] = await db.execute(
      `
    SELECT
      so.id,
      so.order_ref,
      so.status,
      so.price,
      so.reward_coins_used,
      so.refund_amount,
      so.address_id,
      s.name AS service_name,

      sv.variant_name,
      sv.title,
      sv.image_url

    FROM external_service_orders so

    JOIN services s
      ON s.id = so.service_id

    LEFT JOIN service_variants sv
      ON sv.id = so.variant_id

    WHERE so.id = ?
    AND so.user_id = ?
    `,
      [serviceOrderId, userId],
    );

    if (!order) {
      throw new Error("SERVICE_ORDER_NOT_FOUND");
    }

    // =====================================
    // Cancellation details
    // =====================================

    const [[cancellation]] = await db.execute(
      `
      SELECT
        status,
        refund_amount,
        refund_status,
        refund_method,
        created_at

      FROM external_service_order_cancellations

      WHERE service_order_id = ?
      `,
      [serviceOrderId],
    );

    // =====================================
    // Timeline
    // =====================================

    const [timeline] = await db.execute(
      `
    SELECT
      event,
      created_at

    FROM external_service_order_cancellation_timeline

    WHERE service_order_id = ?

    ORDER BY created_at ASC
    `,
      [serviceOrderId],
    );

    // =====================================
    // Refunds
    // =====================================

    const [refunds] = await db.execute(
      `
    SELECT
      refund_amount,
      refund_method,
      status

    FROM external_service_order_refunds

    WHERE service_order_id = ?
    `,
      [serviceOrderId],
    );

    let moneyRefund = 0;
    let coinRefund = 0;

    refunds.forEach((r) => {
      if (r.refund_method === "original") {
        moneyRefund += Number(r.refund_amount);
      }

      if (r.refund_method === "wallet") {
        coinRefund += Number(r.refund_amount);
      }
    });

    // =====================================
    // Final response
    // =====================================

    return {
      service_order_id: order.id,

      order_ref: order.order_ref,

      status: order.status,

      service: {
        service_name: order.service_name,

        variant_name: order.variant_name,

        title: order.title,

        image_url: order.image_url ? getPublicUrl(order.image_url) : null,
      },

      cancellation: cancellation
        ? {
            status: cancellation.status,

            refund_status: cancellation.refund_status,

            refund_method: cancellation.refund_method,

            refund_amount: Number(cancellation.refund_amount),

            created_at: cancellation.created_at,
          }
        : null,

      timeline: timeline.map((t) => ({
        label: mapServiceCancelEvent(t.event),

        event: t.event,

        date: t.created_at,
      })),

      refund: {
        total: moneyRefund + coinRefund,

        money_refund: moneyRefund,

        coin_refund: coinRefund,
      },

      rewards: {
        used: Number(order.reward_coins_used || 0),

        reversed: coinRefund,
      },

      summary: {
        service_total: Number(order.price),

        order_total: Number(order.price),
      },
    };
  }
}

module.exports = new ServiceModel();
