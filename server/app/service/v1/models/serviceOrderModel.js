const db = require("../../../../config/database");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class ServiceOrderModel {
  // create order
  async create(data) {
    const [result] = await db.execute(
      `INSERT INTO service_orders
    (user_id, service_id, variant_id, address_id, enquiry_id, price, parent_order_id, bundle_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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

    await db.execute(`UPDATE service_orders SET order_ref = ? WHERE id = ?`, [
      ref,
      insertId,
    ]);

    return {
      id: insertId,
      order_ref: ref,
    };
  }

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

    FROM service_orders so
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
  async getOrderById(orderId, userId) {
    // Get parent_order_id for the given order
    const [[order]] = await db.execute(
      `SELECT parent_order_id 
     FROM service_orders 
     WHERE id = ? AND user_id = ?`,
      [orderId, userId],
    );

    if (!order) return null;

    const parentId = order.parent_order_id;

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

      ca.address_type,
      ca.address1,
      ca.address2,
      ca.city,
      ca.zipcode,
      ca.landmark,
      ca.contact_name,
      ca.contact_phone,

      st.state_name,
      c.country_name,

      s.name AS service_name,
      sv.variant_name,
      sv.title,
      sv.image_url

    FROM service_orders so
    JOIN services s ON s.id = so.service_id
    LEFT JOIN service_variants sv ON sv.id = so.variant_id
    
    LEFT JOIN customer_addresses ca
      ON so.address_id = ca.address_id

    LEFT JOIN states st
      ON ca.state_id = st.state_id

    LEFT JOIN countries c
      ON ca.country_id = c.country_id

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
      address: {
        address_type: rows[0].address_type,
        address1: rows[0].address1,
        address2: rows[0].address2,
        city: rows[0].city,
        zipcode: rows[0].zipcode,
        landmark: rows[0].landmark,
        contact_name: rows[0].contact_name,
        contact_phone: rows[0].contact_phone,
        state: rows[0].state_name,
        country: rows[0].country_name,
      },
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

  // update status
  async updateStatus(orderId, status) {
    const [result] = await db.execute(
      `UPDATE service_orders 
     SET status = ? 
     WHERE id = ?`,
      [status, orderId],
    );

    return result.affectedRows;
  }
}

module.exports = new ServiceOrderModel();
