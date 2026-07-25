const db = require("../../../../config/database");
const { calculateServiceRewards } = require("../utils/serviceRewards");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class ServiceCartModel {
  // get or create cart item
  async getOrCreateCart(userId) {
    const [rows] = await db.execute(
      `SELECT * FROM service_cart 
     WHERE user_id = ? AND status = 'active'
     ORDER BY id DESC 
     LIMIT 1`,
      [userId],
    );

    if (rows.length) return rows[0];

    const [result] = await db.execute(
      `INSERT INTO service_cart (user_id, status) VALUES (?, 'active')`,
      [userId],
    );

    return { id: result.insertId, user_id: userId };
  }

  // add item to cart
  async addItem(cartId, data) {
    // check if same variant already exists
    const [existing] = await db.execute(
      `SELECT id FROM service_cart_items 
       WHERE cart_id = ? AND variant_id = ?`,
      [cartId, data.variant_id],
    );

    if (existing.length) {
      return;
    }

    await db.execute(
      `INSERT INTO service_cart_items
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

        bi.id AS bundle_item_id,
        bi.price AS bundle_price,
        sv.price AS individual_price,
        sb.name AS bundle_name,
        sb.description AS bundle_description,
        sb.type AS bundle_type,
        sb.banner_image AS bundle_image,
        (
          SELECT COUNT(*)
          FROM service_bundle_items all_bi
          WHERE all_bi.bundle_id = ci.bundle_id
        ) AS bundle_item_count,

        s.name AS service_name,
        sv.variant_name,
        sv.id as variant_id,
        sv.service_id,
        sv.title,
        sv.image_url,
        sv.can_earn_reward,
        sv.earn_reward_type,
        sv.earn_reward_value,
        sv.max_earn_reward,
        sv.can_redeem_reward,
        sv.redemption_type,
        sv.redemption_value,
        sv.max_redemption_amount,

        sd.id as document_id,
        sd.document_name,
        sd.is_mandatory

      FROM service_cart_items ci
      JOIN services s ON s.id = ci.service_id
      JOIN service_variants sv ON sv.id = ci.variant_id
      LEFT JOIN service_bundles sb ON sb.id = ci.bundle_id
      LEFT JOIN service_bundle_items bi ON bi.bundle_id = ci.bundle_id
        AND bi.service_id = ci.service_id
        AND bi.variant_id = ci.variant_id
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
          bundle_item_id: item.bundle_item_id,
          bundle_price:
            item.bundle_price === null ? null : Number(item.bundle_price),
          individual_price: Number(item.individual_price),
          bundle_name: item.bundle_name,
          bundle_description: item.bundle_description,
          bundle_type: item.bundle_type,
          bundle_image: getPublicUrl(item.bundle_image),
          bundle_item_count: item.bundle_item_count
            ? Number(item.bundle_item_count)
            : 0,

          service_name: item.service_name,
          variant_name: item.variant_name,
          variant_id: item.variant_id,
          service_id: item.service_id,
          title: item.title,
          image_url: getPublicUrl(item.image_url),
          variant_image: getPublicUrl(item.image_url),
          can_earn_reward: Number(item.can_earn_reward),
          earn_reward_type: item.earn_reward_type,
          earn_reward_value: Number(item.earn_reward_value || 0),
          max_earn_reward: item.max_earn_reward === null ? null : Number(item.max_earn_reward),
          can_redeem_reward: Number(item.can_redeem_reward),
          redemption_type: item.redemption_type,
          redemption_value: Number(item.redemption_value || 0),
          max_redemption_amount: item.max_redemption_amount === null ? null : Number(item.max_redemption_amount),

          rewards: calculateServiceRewards(item.price, item),

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
            bundle_name: item.bundle_name,
            bundle_description: item.bundle_description,
            bundle_type: item.bundle_type,
            bundle_image: item.bundle_image,
            bundle_item_count: item.bundle_item_count
              ? Number(item.bundle_item_count)
              : 0,
            items: [],
            bundle_total: 0,
            is_bundle_applied: false,
          };
        }

        bundles[item.bundle_id].items.push(item);
      } else {
        individual_items.push(item);
      }
    });

    Object.values(bundles).forEach((bundle) => {
      const isFullBundleSelected =
        bundle.bundle_item_count > 0 &&
        bundle.items.length === bundle.bundle_item_count;
      const shouldApplyBundlePrice =
        bundle.bundle_type === "fixed" ||
        (bundle.bundle_type === "custom" && isFullBundleSelected);

      bundle.is_bundle_applied = shouldApplyBundlePrice;
      bundle.bundle_total = 0;

      bundle.items.forEach((item) => {
        const price = shouldApplyBundlePrice
          ? item.bundle_price
          : item.individual_price;

        item.price = Number(price);
        item.rewards = calculateServiceRewards(item.price, item);
        bundle.bundle_total += item.price * (item.quantity || 1);
      });
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
     FROM service_cart_items 
     WHERE id = ? AND cart_id = ?`,
      [itemId, cartId],
    );

    // item does not belong to this cart
    if (!item) return false;

    // if bundle item remove entire bundle from same cart
    if (item.bundle_id) {
      await db.execute(
        `DELETE FROM service_cart_items
       WHERE cart_id = ? AND bundle_id = ?`,
        [cartId, item.bundle_id],
      );
    } else {
      await db.execute(
        `DELETE FROM service_cart_items
       WHERE id = ? AND cart_id = ?`,
        [itemId, cartId],
      );
    }

    return true;
  }

  // remove bundle from cart
  async removeBundle(cartId, bundleId) {
    await db.execute(
      `DELETE FROM service_cart_items 
     WHERE cart_id = ? AND bundle_id = ?`,
      [cartId, bundleId],
    );
  }

  // clear cart
  async clearCart(cartId, conn = db) {
    await conn.execute(`DELETE FROM service_cart_items WHERE cart_id = ?`, [
      cartId,
    ]);
  }
}

module.exports = new ServiceCartModel();
