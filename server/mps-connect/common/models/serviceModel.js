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

    await db.execute(`UPDATE external_service_orders SET order_ref = ? WHERE id = ?`, [
      ref,
      insertId,
    ]);

    return {
      id: insertId,
      order_ref: ref,
    };
  }
}

module.exports = new ServiceModel();
