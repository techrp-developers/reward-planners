const db = require("../../../../config/database");
const RewardModel = require("../../../../models/rewardModel");
const fs = require("fs");
const path = require("path");

const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

function calculateReward(amount, rules = []) {
  let total = 0;

  for (let rule of rules) {
    if (!rule.can_earn_reward) continue;

    let reward = 0;

    if (rule.reward_type === "percentage") {
      reward = (amount * rule.reward_value) / 100;

      if (rule.max_reward) {
        reward = Math.min(reward, rule.max_reward);
      }
    }

    if (rule.reward_type === "fixed") {
      reward = rule.reward_value;
    }

    total += reward;

    // stop if not stackable
    if (!rule.is_stackable) break;
  }

  return Math.floor(total);
}

class cartModel {
  // Get all cart item
  // async getUserCart(userId) {
  //   const query = `
  //     SELECT
  //       ci.cart_item_id,
  //       ci.quantity,

  //       p.product_id,
  //       p.product_name,
  //       p.category_id,
  //       p.subcategory_id,

  //       v.variant_id,
  //       v.variant_attributes,
  //       v.mrp,
  //       v.sale_price,
  //       v.reward_redemption_limit,

  //       (ci.quantity * v.sale_price) AS item_total,

  //       GROUP_CONCAT(
  //         DISTINCT CONCAT(
  //           pi.image_id, '::',
  //           pi.image_url, '::',
  //           pi.sort_order
  //         )
  //         ORDER BY pi.sort_order ASC
  //       ) AS images

  //     FROM cart_items ci
  //     JOIN eproducts p
  //       ON ci.product_id = p.product_id
  //     JOIN product_variants v
  //       ON ci.variant_id = v.variant_id
  //     LEFT JOIN product_images pi
  //       ON p.product_id = pi.product_id

  //     WHERE ci.user_id = ?
  //     GROUP BY ci.cart_item_id
  //     ORDER BY ci.created_at DESC
  //   `;

  //   const [rows] = await db.execute(query, [userId]);

  //   let cartTotal = 0;
  //   let totalDiscount = 0;

  //   const items = rows.map((row) => {
  //     let images = [];

  //     if (row.images) {
  //       images = row.images.split(",").map((img) => {
  //         const [, image_url] = img.split("::");
  //         return { image_url };
  //       });
  //     }

  //     let attributes = {};
  //     if (row.variant_attributes) {
  //       try {
  //         attributes = JSON.parse(row.variant_attributes);
  //       } catch (e) {
  //         attributes = {};
  //       }
  //     }

  //     const imagePath = images.length ? images[0].image_url : null;

  //     const salePrice = Number(row.sale_price) || 0;
  //     const quantity = Number(row.quantity) || 0;
  //     const rewardPercent = Number(row.reward_redemption_limit) || 0;

  //     const itemTotal = salePrice * quantity;

  //     const rewardDiscountAmount = Math.round(
  //       (itemTotal * rewardPercent) / 100,
  //     );

  //     const finalItemTotal = itemTotal - rewardDiscountAmount;

  //     // accumulate cart values
  //     cartTotal += finalItemTotal;
  //     totalDiscount += rewardDiscountAmount;

  //     return {
  //       cart_item_id: row.cart_item_id,
  //       product_id: row.product_id,
  //       variant_id: row.variant_id,

  //       product_name: row.product_name,
  //       image: getPublicUrl(imagePath),

  //       attributes,

  //       mrp: row.mrp,
  //       sale_price: salePrice,
  //       quantity,
  //       perUnitDiscount: Number(row.mrp - salePrice),
  //       item_total: itemTotal,
  //       points: rewardDiscountAmount,
  //       final_item_total: finalItemTotal,
  //     };
  //   });

  //   return {
  //     items,
  //     cartTotal,
  //     totalDiscount,
  //   };
  // }

  async getUserCart(userId) {
    const query = `
    SELECT 
      ci.cart_item_id,
      ci.quantity,

      p.product_id,
      p.product_name,
      p.category_id,
      p.subcategory_id,

      v.variant_id,
      v.variant_attributes,
      v.mrp,
      v.sale_price,

      GROUP_CONCAT(
        DISTINCT CONCAT(
          pi.image_id, '::',
          pi.image_url, '::',
          pi.sort_order
        )
        ORDER BY pi.sort_order ASC
      ) AS images

    FROM cart_items ci
    JOIN eproducts p ON ci.product_id = p.product_id
    JOIN product_variants v ON ci.variant_id = v.variant_id
    LEFT JOIN product_images pi ON p.product_id = pi.product_id

    WHERE ci.user_id = ?
    GROUP BY ci.cart_item_id
    ORDER BY ci.created_at DESC
  `;

    const [rows] = await db.execute(query, [userId]);

    return {
      items: rows.map((row) => {
        let image = null;

        if (row.images) {
          const first = row.images.split(",")[0];
          image = `${CDN_BASE_URL}/${first.split("::")[1]}`;
        }

        return {
          cart_item_id: row.cart_item_id,
          product_id: row.product_id,
          variant_id: row.variant_id,
          category_id: row.category_id,
          subcategory_id: row.subcategory_id,

          product_name: row.product_name,
          image,

          sale_price: Number(row.sale_price),
          mrp: Number(row.mrp),
          quantity: Number(row.quantity),
        };
      }),
    };
  }

  //cart summary
  // async getCartSummary(user_id, useRewards = true) {
  //   // 1. Get wallet
  //   const [[wallet]] = await db.execute(
  //     `SELECT balance FROM customer_wallet WHERE user_id = ?`,
  //     [user_id],
  //   );

  //   const walletBalance = Number(wallet?.balance || 0);

  //   // 2. Get cart + reward config
  //   const [cartItems] = await db.execute(
  //     `
  //     SELECT
  //       ci.cart_item_id,
  //       ci.product_id,
  //       ci.variant_id,
  //       ci.quantity,

  //       pv.sale_price,
  //       pv.reward_redemption_limit,

  //       prs.can_earn_reward,
  //       prs.can_redeem_reward,

  //       rr.reward_type,
  //       rr.reward_value,
  //       rr.max_reward

  //     FROM cart_items ci

  //     JOIN product_variants pv ON pv.variant_id = ci.variant_id

  //     LEFT JOIN product_reward_settings prs
  //       ON prs.id = (
  //         SELECT prs2.id
  //         FROM product_reward_settings prs2
  //         WHERE prs2.product_id = ci.product_id
  //           AND prs2.is_active = 1
  //           AND (
  //             prs2.variant_id = ci.variant_id
  //             OR prs2.variant_id IS NULL
  //           )
  //         ORDER BY
  //           CASE WHEN prs2.variant_id = ci.variant_id THEN 1 ELSE 2 END
  //         LIMIT 1
  //     )

  //     LEFT JOIN reward_rules rr
  //     ON rr.reward_rule_id = prs.reward_rule_id
  //     AND rr.is_active = 1

  //     WHERE ci.user_id = ?
  //   `,
  //     [user_id],
  //   );

  //   // 3. Build cart
  //   let cartTotal = 0;
  //   let totalRewardEarn = 0;

  //   const items = cartItems.map((item) => {
  //     const price = Number(item.sale_price || 0);
  //     const qty = Number(item.quantity || 0);

  //     const itemTotal = price * qty;
  //     cartTotal += itemTotal;

  //     return {
  //       ...item,
  //       itemTotal,
  //       rewardEarn: 0,
  //       redeemable: 0,
  //     };
  //   });

  //   // 4. Calculate earning
  //   for (let item of items) {
  //     if (!item.can_earn_reward || !item.reward_type) continue;

  //     let reward = 0;

  //     if (item.reward_type === "fixed") {
  //       reward = item.reward_value;
  //     } else if (item.reward_type === "percentage") {
  //       reward = (item.itemTotal * item.reward_value) / 100;
  //     }

  //     if (item.max_reward) {
  //       reward = Math.min(reward, item.max_reward);
  //     }

  //     item.rewardEarn = Math.floor(reward);
  //     totalRewardEarn += item.rewardEarn;
  //   }

  //   // 5. Wallet redemption
  //   let remainingWallet = useRewards ? walletBalance : 0;
  //   let totalRedeemed = 0;

  //   for (let item of items) {
  //     if (!useRewards) break;

  //     if (!item.can_redeem_reward || !item.reward_redemption_limit) continue;
  //     if (remainingWallet <= 0) break;

  //     const maxAllowed = Math.floor(
  //       (item.itemTotal * item.reward_redemption_limit) / 100,
  //     );

  //     const usable = Math.min(remainingWallet, maxAllowed, item.itemTotal);

  //     item.redeemable = usable;

  //     remainingWallet -= usable;
  //     totalRedeemed += usable;
  //   }

  //   totalRedeemed = Math.min(totalRedeemed, cartTotal);

  //   const finalPayable = cartTotal - totalRedeemed;

  //   return {
  //     cartTotal,
  //     finalPayable,
  //     walletBalance,
  //     remainingWallet,
  //     totalRewardEarn,
  //     totalRedeemed,
  //     items,
  //   };
  // }

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

      p.category_id,
      p.subcategory_id,

      pv.sale_price,
      pv.reward_redemption_limit

    FROM cart_items ci
    JOIN product_variants pv ON pv.variant_id = ci.variant_id
    JOIN eproducts p ON p.product_id = ci.product_id

    WHERE ci.user_id = ?
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
      const price = Number(item.sale_price || 0);
      const qty = Number(item.quantity || 0);

      const itemTotal = price * qty;
      cartTotal += itemTotal;

      /* ===============================
       REWARD ENGINE (CACHED)
    =============================== */
      const key = `${item.product_id}_${item.variant_id}_${item.category_id}_${item.subcategory_id}_${price}`;

      let rules = rewardCache[key];

      if (!rules) {
        rules = await RewardModel.getProductRewards(
          item.product_id,
          item.variant_id,
          item.category_id,
          item.subcategory_id,
          price,
        );

        rewardCache[key] = rules;
      }

      let rewardEarn = 0;

      // earning still from rules
      if (rules.length) {
        rewardEarn = calculateReward(itemTotal, rules);
      }

      //  redemption from variant (fallback / primary)
      const redemptionLimit = Number(item.reward_redemption_limit || 0);
      const canRedeem = redemptionLimit > 0;

      totalRewardEarn += rewardEarn;

      items.push({
        ...item,
        itemTotal,
        rewardEarn,
        canRedeem,
        redemptionLimit,
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

      const maxAllowed = Math.floor(
        (item.itemTotal * item.redemptionLimit) / 100,
      );

      const usable = Math.min(remainingWallet, maxAllowed, item.itemTotal);

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
  // async addToCart({ userId, productId, variantId, quantity }) {
  //   const [[variant]] = await db.execute(
  //     `
  //     SELECT variant_id, stock
  //     FROM product_variants
  //     WHERE variant_id = ? AND product_id = ?
  //     `,
  //     [variantId, productId],
  //   );

  //   if (!variant) {
  //     throw new Error("INVALID_VARIANT");
  //   }

  //   if (variant.stock < quantity) {
  //     throw new Error("INSUFFICIENT_STOCK");
  //   }

  //   // 2 Insert or update cart item
  //   await db.execute(
  //     `
  //     INSERT INTO cart_items (user_id, product_id, variant_id, quantity)
  //     VALUES (?, ?, ?, ?)
  //     ON DUPLICATE KEY UPDATE
  //       quantity = quantity + VALUES(quantity)
  //     `,
  //     [userId, productId, variantId, quantity],
  //   );

  //   return true;
  // }

  async addToCart({ userId, productId, variantId, quantity }) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [[variant]] = await conn.execute(
        `SELECT stock FROM product_variants WHERE variant_id = ? FOR UPDATE`,
        [variantId],
      );

      if (!variant) throw new Error("INVALID_VARIANT");

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
      INSERT INTO cart_items (user_id, product_id, variant_id, quantity)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = ?
      `,
        [userId, productId, variantId, quantity, newQty],
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
