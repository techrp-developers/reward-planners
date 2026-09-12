const db = require("../../../../config/database");
const RewardModel = require("../../../../models/rewardModel");
const fs = require("fs");
const path = require("path");
const {
  calculateReward,
  resolveRedemption,
  calculateRedeemableCoins,
} = require("../utils/rewardCalculate");

const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class cartModel {
  // Get all cart item
  async getUserCart(userId) {
    const query = `
    SELECT 
      ci.cart_item_id,
      ci.quantity,
      ci.flash_sale_campaign_id,

      p.product_id,
      p.product_name,
      p.category_id,
      p.subcategory_id,

      p.is_discount_eligible,
      p.is_returnable,
      p.is_replaceable,
      p.return_window_days,

      v.variant_id,
      v.variant_attributes,
      v.mrp,
      v.sale_price,
      csi.offer_price,

      COALESCE(
        (SELECT pvi.image_url FROM product_variant_images pvi
         WHERE pvi.variant_id = ci.variant_id
         ORDER BY pvi.sort_order ASC, pvi.image_id ASC LIMIT 1),
        (SELECT pi.image_url FROM product_images pi
         WHERE pi.product_id = ci.product_id
         ORDER BY pi.sort_order ASC, pi.image_id ASC LIMIT 1)
      ) AS image_path

    FROM cart_items ci
    JOIN eproducts p ON ci.product_id = p.product_id
    JOIN product_variants v ON ci.variant_id = v.variant_id AND ci.product_id = v.product_id
    LEFT JOIN campaign_items csi
      ON csi.campaign_id = ci.flash_sale_campaign_id
      AND csi.product_id = ci.product_id
      AND csi.variant_id = ci.variant_id
      AND EXISTS (
        SELECT 1 FROM campaigns active_campaign
        WHERE active_campaign.campaign_id = csi.campaign_id
          AND active_campaign.campaign_type = 'flash_sale'
          AND active_campaign.status = 'active'
          AND NOW() BETWEEN active_campaign.start_at AND active_campaign.end_at
      )
    LEFT JOIN campaigns c
      ON c.campaign_id = csi.campaign_id
      AND c.campaign_type = 'flash_sale'
      AND c.status = 'active'
      AND NOW() BETWEEN c.start_at AND c.end_at

    WHERE ci.user_id = ?
      AND COALESCE(p.created_via, '') != 'flea_market_quick_create'
    GROUP BY ci.cart_item_id
    ORDER BY ci.created_at DESC
  `;

    const [rows] = await db.execute(query, [userId]);

    return {
      items: rows.map((row) => {
        let image = null;

        if (row.image_path) image = getPublicUrl(row.image_path);

        let attributes = {};
        if (row.variant_attributes) {
          try {
            attributes =
              typeof row.variant_attributes === "string"
                ? JSON.parse(row.variant_attributes)
                : row.variant_attributes;
          } catch {
            attributes = {};
          }
        }

        return {
          cart_item_id: row.cart_item_id,
          product_id: row.product_id,
          variant_id: row.variant_id,
          variant_attributes: attributes,
          attributes,
          category_id: row.category_id,
          subcategory_id: row.subcategory_id,

          product_name: row.product_name,
          image,

          is_discount_eligible: row.is_discount_eligible,
          is_returnable: row.is_returnable,
          return_window: row.return_window_days,
          is_replaceable: row.is_replaceable,

          sale_price: Number(row.sale_price),
          effective_sale_price: Number(row.offer_price ?? row.sale_price),
          flash_sale_campaign_id: row.flash_sale_campaign_id,
          mrp: Number(row.mrp),
          quantity: Number(row.quantity),
        };
      }),
    };
  }

  // cart summary
  async getCartSummary(user_id, useRewards = true) {
    // 1. Wallet
    const [[wallet]] = await db.execute(
      `SELECT balance FROM customer_wallet WHERE user_id = ?`,
      [user_id],
    );

    const walletBalance = Number(wallet?.balance || 0);

    // 2. Cart items
    const [cartItems] = await db.execute(
      `
      SELECT 
        ci.product_id,
        ci.variant_id,
        ci.quantity,
        ci.flash_sale_campaign_id,

        p.category_id,
        p.subcategory_id,
        p.is_discount_eligible,

        pv.sale_price,
        csi.offer_price

      FROM cart_items ci
      JOIN product_variants pv ON pv.variant_id = ci.variant_id
      JOIN eproducts p ON p.product_id = ci.product_id
      LEFT JOIN campaign_items csi
        ON csi.campaign_id = ci.flash_sale_campaign_id
        AND csi.product_id = ci.product_id
        AND csi.variant_id = ci.variant_id
        AND EXISTS (
          SELECT 1 FROM campaigns active_campaign
          WHERE active_campaign.campaign_id = csi.campaign_id
            AND active_campaign.campaign_type = 'flash_sale'
            AND active_campaign.status = 'active'
            AND NOW() BETWEEN active_campaign.start_at AND active_campaign.end_at
        )
      LEFT JOIN campaigns c
        ON c.campaign_id = csi.campaign_id
        AND c.campaign_type = 'flash_sale'
        AND c.status = 'active'
        AND NOW() BETWEEN c.start_at AND c.end_at

      WHERE ci.user_id = ?
        AND COALESCE(p.created_via, '') != 'flea_market_quick_create'
    `,
      [user_id],
    );

    /* ===============================
      CACHE
    =============================== */
    const rewardCache = {};

    let cartTotal = 0;
    let totalRewardEarn = 0;

    const items = [];

    for (let item of cartItems) {
      const fixedPrice = item.flash_sale_campaign_id !== null && item.offer_price !== null;
      const price = Number(item.offer_price ?? item.sale_price ?? 0);
      const qty = Number(item.quantity || 0);

      const itemTotal = price * qty;
      cartTotal += itemTotal;

      /* ===============================
        REWARD RULES (CACHED)
      =============================== */
      const key = `${item.product_id}_${item.variant_id}_${item.category_id}_${item.subcategory_id}_${itemTotal}`;

      let rules = rewardCache[key];

      if (!fixedPrice && !rules) {
        rules = await RewardModel.getProductRewards(
          item.product_id,
          item.variant_id,
          item.category_id,
          item.subcategory_id,
          itemTotal,
          item.is_discount_eligible,
        );

        rewardCache[key] = rules;
      }

      // earning
      let rewardEarn = 0;
      if (!fixedPrice && rules.length) {
        rewardEarn = calculateReward(itemTotal, rules);
      }

      /* ===============================
        REDEMPTION (rule-based, per line item)
        =============================== */
      const redemption = fixedPrice ? null : resolveRedemption(itemTotal, rules);
      const maxAllowed = fixedPrice ? 0 : calculateRedeemableCoins(itemTotal, redemption);
      const canRedeem = maxAllowed > 0;

      totalRewardEarn += rewardEarn;

      items.push({
        ...item,
        itemTotal,
        rewardEarn,
        canRedeem,
        redemptionLimit: maxAllowed,
        redeemable: 0,
      });
    }

    /* ===============================
      REDEMPTION ENGINE
    =============================== */
    let remainingWallet = useRewards ? walletBalance : 0;
    let totalRedeemed = 0;

    for (let item of items) {
      if (!useRewards) break;
      if (!item.canRedeem) continue;
      if (remainingWallet <= 0) break;

      const usable = Math.min(
        remainingWallet,
        item.redemptionLimit,
        item.itemTotal,
      );

      item.redeemable = usable;

      remainingWallet -= usable;
      totalRedeemed += usable;
    }

    totalRedeemed = Math.min(totalRedeemed, cartTotal);

    const finalPayable = cartTotal - totalRedeemed;

    return {
      cartTotal,
      finalPayable,

      walletBalance,
      remainingWallet,

      totalRewardEarn,
      totalRedeemed,

      items,
    };
  }

  // Add to cart
  async addToCart({ userId, productId, variantId, quantity, campaignId = null }) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [[variant]] = await conn.execute(
        `SELECT pv.stock
         FROM product_variants pv
         JOIN eproducts p ON p.product_id = pv.product_id
         WHERE pv.variant_id = ?
           AND pv.product_id = ?
           AND COALESCE(p.created_via, '') != 'flea_market_quick_create'
         FOR UPDATE`,
        [variantId, productId],
      );

      if (!variant) throw new Error("INVALID_VARIANT");

      if (campaignId !== null) {
        const [[campaignItem]] = await conn.execute(
          `SELECT ci.offer_price
           FROM campaign_items ci
           JOIN campaigns c ON c.campaign_id = ci.campaign_id
           WHERE ci.campaign_id = ? AND ci.product_id = ? AND ci.variant_id = ?
             AND c.campaign_type = 'flash_sale'
             AND c.status = 'active'
             AND NOW() BETWEEN c.start_at AND c.end_at
             AND ci.offer_price IS NOT NULL
           FOR UPDATE`,
          [campaignId, productId, variantId],
        );
        if (!campaignItem) throw new Error("INVALID_FLASH_SALE");
      }

      const [[existing]] = await conn.execute(
        `SELECT quantity FROM cart_items WHERE user_id = ? AND variant_id = ? FOR UPDATE`,
        [userId, variantId],
      );

      const newQty = (existing?.quantity || 0) + quantity;

      if (newQty > variant.stock) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      await conn.execute(
        `
      INSERT INTO cart_items (user_id, product_id, variant_id, flash_sale_campaign_id, quantity)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = ?, flash_sale_campaign_id = VALUES(flash_sale_campaign_id)
      `,
        [userId, productId, variantId, campaignId, quantity, newQty],
      );

      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // check quantity
  async checkVariantStock(variantId) {
    const [[row]] = await db.execute(
      `
      SELECT 
        variant_id,
        stock
      FROM product_variants
      WHERE variant_id = ?
      `,
      [variantId],
    );

    if (!row) {
      throw new Error("VARIANT_NOT_FOUND");
    }

    return {
      variant_id: row.variant_id,
      stock: row.stock,
      inStock: row.stock > 0,
    };
  }

  // update cart item
  async updateCartItem({ userId, cartItemId, quantity }) {
    // 1 Fetch cart item + variant stock
    const [[row]] = await db.execute(
      `
      SELECT 
        ci.cart_item_id,
        ci.variant_id,
        v.stock
      FROM cart_items ci
      JOIN product_variants v
        ON ci.variant_id = v.variant_id
      WHERE ci.cart_item_id = ? AND ci.user_id = ?
      `,
      [cartItemId, userId],
    );

    if (!row) {
      throw new Error("CART_ITEM_NOT_FOUND");
    }

    // 2 Quantity = 0 → remove item
    if (quantity === 0) {
      await db.execute(`DELETE FROM cart_items WHERE cart_item_id = ?`, [
        cartItemId,
      ]);
      return { removed: true };
    }

    // 3 Stock validation
    if (quantity > row.stock) {
      throw new Error("INSUFFICIENT_STOCK");
    }

    // 4 Update quantity
    await db.execute(
      `
      UPDATE cart_items
      SET quantity = ?
      WHERE cart_item_id = ?
      `,
      [quantity, cartItemId],
    );

    return { updated: true };
  }

  // delete cart item
  async deleteCartItem({ userId, cartItemId }) {
    const [result] = await db.execute(
      `
      DELETE FROM cart_items
      WHERE cart_item_id = ? AND user_id = ?
      `,
      [cartItemId, userId],
    );

    if (result.affectedRows === 0) {
      throw new Error("CART_ITEM_NOT_FOUND");
    }

    return true;
  }

  // remove all cart items
  async clearCart(userId) {
    await db.execute(
      `
      DELETE FROM cart_items
      WHERE user_id = ?
      `,
      [userId],
    );

    return true;
  }
}

module.exports = new cartModel();
