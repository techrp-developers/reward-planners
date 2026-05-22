const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");
const CDN_BASE_URL = "https://cdn.rewardplanners.com";

class wishListModel {
  // add to wishlist
  async add(userId, productId, variantId) {
    const [result] = await db.execute(
      `INSERT IGNORE INTO customer_wishlist 
       (user_id, product_id, variant_id)
       VALUES (?, ?, ?)`,
      [userId, productId, variantId],
    );

    return result.affectedRows;
  }

  // remove from wishlist
  async remove(userId, productId, variantId) {
    const [result] = await db.execute(
      `DELETE FROM customer_wishlist
       WHERE user_id = ? AND product_id = ? AND variant_id = ?`,
      [userId, productId, variantId],
    );

    return result.affectedRows;
  }

  // check if item exist in wishlist
  async exists(userId, productId, variantId) {
    const [rows] = await db.execute(
      `SELECT wishlist_id
       FROM customer_wishlist
       WHERE user_id = ? AND product_id = ? AND variant_id = ?`,
      [userId, productId, variantId],
    );

    return rows.length > 0;
  }

  // fetch all user wishlist
  async getByUser(userId) {
    const [rows] = await db.execute(
      `
    SELECT 
      w.wishlist_id,
      p.product_id,
      p.product_name,
      p.brand_name,
      v.mrp,
      v.sale_price,
      v.reward_redemption_limit,

      GROUP_CONCAT(
        DISTINCT CONCAT(
          pi.image_id, '::',
          pi.image_url, '::',
          pi.type, '::',
          pi.sort_order
        )
        ORDER BY pi.sort_order ASC
      ) AS images

    FROM customer_wishlist w

    JOIN eproducts p 
      ON p.product_id = w.product_id

    /* ---- Cheapest Visible Variant (same as category) ---- */
    LEFT JOIN product_variants v
      ON v.variant_id = (
        SELECT pv2.variant_id
        FROM product_variants pv2
        WHERE pv2.product_id = p.product_id
          AND pv2.is_visible = 1
          AND pv2.sale_price IS NOT NULL
        ORDER BY pv2.sale_price ASC, pv2.variant_id ASC
        LIMIT 1
      )

    LEFT JOIN product_images pi 
      ON p.product_id = pi.product_id

    WHERE 
      w.user_id = ?
      AND p.status = 'approved'
      AND p.is_visible = 1
      AND v.variant_id IS NOT NULL

    GROUP BY w.wishlist_id
    ORDER BY w.created_at DESC
    `,
      [userId],
    );

    return rows.map((row) => {
      let images = [];

      if (row.images) {
        images = row.images.split(",").map((item) => {
          const [image_id, image_url, type, sort_order] = item.split("::");
          return {
            image_id: Number(image_id),
            image_url: image_url ? `${CDN_BASE_URL}/${image_url}` : null,
            type,
            sort_order: Number(sort_order),
          };
        });
      }

      return {
        wishlist_id: row.wishlist_id,
        product_id: row.product_id,
        product_name: row.product_name,
        brand_name: row.brand_name,
        mrp: row.mrp,
        sale_price: row.sale_price,
        reward_redemption_limit: row.reward_redemption_limit,
        images,
      };
    });
  }

  // wishlist Badging
  async getWishlistCount(userId) {
    const [[row]] = await db.execute(
      `
    SELECT COUNT(*) AS total
    FROM customer_wishlist
    WHERE user_id = ?
    `,
      [userId],
    );

    return row.total;
  }
}

module.exports = new wishListModel();
