const db = require("../../../config/database");
const fs = require("fs");
const path = require("path");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
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
  async getOrderByParentId(orderId, userId) {
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

    FROM service_orders so
    JOIN services s ON s.id = so.service_id
    LEFT JOIN service_variants sv ON sv.id = so.variant_id

    WHERE so.parent_order_id = ? AND so.user_id = ?
    `,
      [parentId, userId],
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

      od.id AS order_document_id,
      od.file_path,
      od.uploaded,
      od.expiry_date,
      od.document_number

    FROM external_service_orders so

    LEFT JOIN service_documents sd 
      ON sd.service_id = so.service_id

    LEFT JOIN external_order_documents od 
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
      sd.is_expirable,

      od.id AS order_document_id,
      od.file_path,
      od.uploaded,
      od.expiry_date,
      od.document_number

    FROM external_service_orders so

    JOIN services s
      ON s.id = so.service_id

    LEFT JOIN service_variants sv
      ON sv.id = so.variant_id

    LEFT JOIN service_documents sd
      ON sd.service_id = so.service_id

    LEFT JOIN external_order_documents od
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
          is_expirable: Boolean(row.is_expirable),
          expiry_date: row.expiry_date,
          document_number: row.document_number,
          uploaded: Boolean(row.uploaded),
          file_url: row.file_path
            ? await getPrivateFileUrl(row.file_path)
            : null,
        });
      }
    }

    // =========================================
    // ADD can_submit
    // =========================================

    Object.values(orderMap).forEach((item) => {
      const mandatoryDocs = item.documents.filter((d) => d.is_mandatory);

      item.can_submit =
        mandatoryDocs.length === 0 || mandatoryDocs.every((d) => d.uploaded);
    });

    return {
      parent_order_id: parentOrderId,

      items: Object.values(orderMap),
    };
  }
}

module.exports = new ServiceModel();
