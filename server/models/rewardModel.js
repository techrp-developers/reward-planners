const db = require("../config/database");

class RewardModel {
  // check logs
  async checkEventLog(conn, user_id, source_type, reference_id) {
    const [rows] = await conn.execute(
      `SELECT id FROM reward_event_log 
     WHERE user_id = ? AND source_type = ? AND reference_id = ?`,
      [user_id, source_type, reference_id],
    );

    return rows.length > 0;
  }

  // insert logs
  async insertEventLog(conn, data) {
    const { user_id, source_type, reference_id } = data;

    await conn.execute(
      `INSERT IGNORE INTO reward_event_log (user_id, source_type, reference_id)
     VALUES (?, ?, ?)`,
      [user_id, source_type, reference_id],
    );
  }

  // MAP PRODUCT / VARIANT
  async mapRewardToProduct(data) {
    const {
      product_id,
      variant_id,
      category_id,
      subcategory_id,
      reward_rule_id,
      can_earn_reward = 1,
      can_redeem_reward = 1,
      priority = 1,
    } = data;

    if (!reward_rule_id) {
      throw new Error("reward_rule_id is required");
    }

    // ensure only one targeting level. A variant target may include product_id
    // only as context for display/lookup, so it should count as variant.
    const targets = [
      variant_id ? 1 : 0,
      !variant_id && product_id ? 1 : 0,
      subcategory_id ? 1 : 0,
      category_id ? 1 : 0,
    ];
    if (targets.reduce((a, b) => a + b, 0) > 1) {
      throw new Error(
        "Only one of variant_id, product_id, subcategory_id, category_id is allowed",
      );
    }

    // dynamic where clause
    let where = "";
    let params = [];

    if (variant_id && product_id) {
      where = "product_id = ? AND variant_id = ?";
      params = [product_id, variant_id];
    } else if (product_id) {
      where = "product_id = ? AND variant_id IS NULL";
      params = [product_id];
    } else if (subcategory_id) {
      where = "subcategory_id = ?";
      params = [subcategory_id];
    } else if (category_id) {
      where = "category_id = ?";
      params = [category_id];
    } else {
      // global rule
      where =
        "product_id IS NULL AND variant_id IS NULL AND category_id IS NULL AND subcategory_id IS NULL";
    }

    const [existing] = await db.execute(
      `SELECT id
       FROM product_reward_settings
       WHERE ${where}
       AND reward_rule_id = ?`,
      [...params, reward_rule_id],
    );

    if (existing.length > 0) {
      const id = existing[0].id;

      await db.execute(
        `UPDATE product_reward_settings
       SET can_earn_reward = ?, can_redeem_reward = ?, priority = ?, is_active = 1
       WHERE id = ?`,
        [can_earn_reward, can_redeem_reward, priority, id],
      );

      return id;
    }

    const [result] = await db.execute(
      `INSERT INTO product_reward_settings 
     (product_id, variant_id, category_id, subcategory_id, reward_rule_id, can_earn_reward, can_redeem_reward, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product_id || null,
        variant_id || null,
        category_id || null,
        subcategory_id || null,
        reward_rule_id,
        can_earn_reward,
        can_redeem_reward,
        priority,
      ],
    );

    return result.insertId;
  }

  // GET PRODUCT REWARD CONFIG
  // async getProductRewards(
  //   product_id,
  //   variant_id,
  //   category_id,
  //   subcategory_id,
  //   order_amount,
  //   isDiscountEligible = true,
  // ) {
  //   if (!isDiscountEligible) return [];

  //   const [rows] = await db.execute(
  //     `
  //   SELECT prs.*, rr.*
  //   FROM product_reward_settings prs
  //   JOIN reward_rules rr 
  //     ON prs.reward_rule_id = rr.reward_rule_id
  //   WHERE prs.is_active = 1
  //     AND rr.is_active = 1
  //     AND (
  //       (prs.variant_id = ? AND prs.product_id = ?) OR
  //       (prs.product_id = ? AND prs.variant_id IS NULL) OR
  //       (prs.subcategory_id = ?) OR
  //       (prs.category_id = ?) OR
  //       (prs.product_id IS NULL AND prs.variant_id IS NULL AND prs.category_id IS NULL AND prs.subcategory_id IS NULL)
  //     )
  //     AND (? >= rr.min_order_amount)
  //     AND (rr.max_order_amount IS NULL OR ? <= rr.max_order_amount)
  //   ORDER BY 
  //     CASE
  //       WHEN prs.variant_id IS NOT NULL THEN 1
  //       WHEN prs.product_id IS NOT NULL THEN 2
  //       WHEN prs.subcategory_id IS NOT NULL THEN 3
  //       WHEN prs.category_id IS NOT NULL THEN 4
  //       ELSE 5
  //     END,
  //     prs.priority ASC,
  //     rr.priority ASC
  //   `,
  //     [
  //       variant_id || 0,
  //       product_id || 0,
  //       product_id || 0,
  //       subcategory_id || 0,
  //       category_id || 0,
  //       order_amount,
  //       order_amount,
  //     ],
  //   );

  //   return rows;
  // }

  async getProductRewards(
    product_id,
    variant_id,
    category_id,
    subcategory_id,
    order_amount,
    isDiscountEligible = true,
  ) {
    if (!isDiscountEligible) return [];

    const [rows] = await db.execute(
      `
    SELECT
      prs.*,
      rr.*,
      prs.priority AS mapping_priority,
      rr.priority AS rule_priority,
      CASE
        WHEN prs.variant_id IS NOT NULL THEN 1
        WHEN prs.product_id IS NOT NULL THEN 2
        WHEN prs.subcategory_id IS NOT NULL THEN 3
        WHEN prs.category_id IS NOT NULL THEN 4
        ELSE 5
      END AS target_rank
    FROM product_reward_settings prs
    JOIN reward_rules rr 
      ON prs.reward_rule_id = rr.reward_rule_id
    WHERE prs.is_active = 1
      AND rr.is_active = 1
      AND (
        (prs.variant_id = ? AND prs.product_id = ?) OR
        (prs.product_id = ? AND prs.variant_id IS NULL) OR
        (prs.subcategory_id = ?) OR
        (prs.category_id = ?) OR
        (prs.product_id IS NULL AND prs.variant_id IS NULL AND prs.category_id IS NULL AND prs.subcategory_id IS NULL)
      )
      AND (? >= rr.min_order_amount)
      AND (rr.max_order_amount IS NULL OR rr.max_order_amount = 0 OR ? <= rr.max_order_amount)
    ORDER BY 
      CASE
        WHEN prs.variant_id IS NOT NULL THEN 1
        WHEN prs.product_id IS NOT NULL THEN 2
        WHEN prs.subcategory_id IS NOT NULL THEN 3
        WHEN prs.category_id IS NOT NULL THEN 4
        ELSE 5
      END,
      rr.min_order_amount DESC,
      COALESCE(rr.max_order_amount, 999999999) ASC,
      prs.priority ASC,
      rr.priority ASC
    `,
      [
        variant_id || 0,
        product_id || 0,
        product_id || 0,
        subcategory_id || 0,
        category_id || 0,
        order_amount,
        order_amount,
      ],
    );

    return rows;
  }

  // Batched sibling of getProductRewards — for a whole PAGE of items (e.g.
  // AllProductsPage) instead of one. Fetches every specificity-matching
  // mapping+rule row for the WHOLE batch in a single query, deliberately
  // omitting the per-item order_amount price-band filter (each item has its
  // own price) — callers must still run each item's candidate rules through
  // resolveRedemption/calculateReward (server/app/ecommerce/v1/utils/
  // rewardCalculate.js), which already do that price-band/active/redemption-
  // capability filtering in pure JS given a rules array. This avoids N
  // round trips without touching that filtering logic at all — same rules,
  // same math, just fetched once instead of once per item.
  //
  // items: [{ productId, variantId, categoryId, subcategoryId, isDiscountEligible }]
  // Returns a Map<string, row[]> keyed by `${productId}:${variantId}` —
  // callers look up their own item's candidate rules by that key.
  async getProductRewardsBatch(items) {
    const eligible = items.filter((item) => item.isDiscountEligible && item.productId != null);
    if (!eligible.length) return new Map();

    const productIds = [...new Set(eligible.map((item) => item.productId))];
    const variantIds = [...new Set(eligible.map((item) => item.variantId).filter((id) => id != null))];
    const categoryIds = [...new Set(eligible.map((item) => item.categoryId).filter((id) => id != null))];
    const subcategoryIds = [...new Set(eligible.map((item) => item.subcategoryId).filter((id) => id != null))];

    const inClause = (column, ids) => `${column} IN (${ids.map(() => "?").join(",")})`;

    // Built in lockstep with params (never pre-declared then patched) so an
    // empty variantIds/categoryIds/subcategoryIds array just omits its
    // branch entirely instead of risking a param/placeholder mismatch.
    const conditions = [];
    const params = [];

    if (variantIds.length) {
      conditions.push(`(${inClause("prs.variant_id", variantIds)} AND ${inClause("prs.product_id", productIds)})`);
      params.push(...variantIds, ...productIds);
    }
    conditions.push(`(${inClause("prs.product_id", productIds)} AND prs.variant_id IS NULL)`);
    params.push(...productIds);

    if (subcategoryIds.length) {
      conditions.push(inClause("prs.subcategory_id", subcategoryIds));
      params.push(...subcategoryIds);
    }
    if (categoryIds.length) {
      conditions.push(inClause("prs.category_id", categoryIds));
      params.push(...categoryIds);
    }
    conditions.push(
      `(prs.product_id IS NULL AND prs.variant_id IS NULL AND prs.category_id IS NULL AND prs.subcategory_id IS NULL)`,
    );

    const [rows] = await db.execute(
      `
    SELECT
      prs.*,
      rr.*,
      prs.priority AS mapping_priority,
      rr.priority AS rule_priority,
      CASE
        WHEN prs.variant_id IS NOT NULL THEN 1
        WHEN prs.product_id IS NOT NULL THEN 2
        WHEN prs.subcategory_id IS NOT NULL THEN 3
        WHEN prs.category_id IS NOT NULL THEN 4
        ELSE 5
      END AS target_rank
    FROM product_reward_settings prs
    JOIN reward_rules rr
      ON prs.reward_rule_id = rr.reward_rule_id
    WHERE prs.is_active = 1
      AND rr.is_active = 1
      AND (${conditions.join(" OR ")})
    `,
      params,
    );

    // Group into per-item candidate lists by re-checking each row against
    // every item's own specificity chain — same logical match the single-
    // item query's WHERE clause does, just evaluated in JS against the
    // pre-fetched batch instead of re-querying per item.
    const result = new Map();
    for (const item of eligible) {
      const key = `${item.productId}:${item.variantId ?? ""}`;
      const matches = rows.filter(
        (row) =>
          (row.variant_id != null && row.variant_id === item.variantId && row.product_id === item.productId) ||
          (row.product_id === item.productId && row.variant_id == null) ||
          (row.subcategory_id != null && row.subcategory_id === item.subcategoryId) ||
          (row.category_id != null && row.category_id === item.categoryId) ||
          (row.product_id == null && row.variant_id == null && row.category_id == null && row.subcategory_id == null),
      );
      result.set(key, matches);
    }
    return result;
  }

  // WALLET TRANSACTION
  async insertWalletTransaction(conn, data) {
    const {
      user_id,
      title,
      description,
      type,
      coins,
      balance_after,
      category,
      reference_id,
      expiry_date,
      reason_code,
    } = data;

    // expiry_date is the caller's rule-based expiry when given (see
    // reward-service.js, which derives it per-rule) — otherwise falls back to
    // now + WALLET_EXPIRY_MONTHS (used by flows like flea market redemption
    // that never pass one).
    const EXPIRY_MONTHS = parseInt(process.env.WALLET_EXPIRY_MONTHS || "3", 10);
    const defaultExpiryDate = new Date();
    defaultExpiryDate.setMonth(defaultExpiryDate.getMonth() + EXPIRY_MONTHS);

    await conn.execute(
      `INSERT INTO wallet_transactions
    (user_id, title, description, transaction_type, coins, balance_after, category, reference_id, expiry_date, reason_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        title,
        description,
        type,
        coins,
        balance_after || null,
        category,
        reference_id,
        expiry_date || defaultExpiryDate,
        reason_code || "ORDER_REWARD",
      ],
    );
  }

  // Get product reward mappings
  async getProductRewardMappings() {
    const [rows] = await db.execute(`
      SELECT 
        prs.id,
        prs.product_id,
        prs.variant_id,
        prs.category_id,
        prs.subcategory_id,
        prs.reward_rule_id,
        prs.can_earn_reward,
        prs.can_redeem_reward,

        c.category_name,
        sc.subcategory_name,

        p.product_name AS product_name,
        v.sku AS variant_name,
        rr.name AS rule_name

      FROM product_reward_settings prs
      LEFT JOIN eproducts p ON p.product_id = prs.product_id
      LEFT JOIN product_variants v ON v.variant_id = prs.variant_id
      LEFT JOIN categories c on c.category_id= prs.category_id
      LEFT JOIN sub_categories sc on sc.subcategory_id = prs.subcategory_id
      JOIN reward_rules rr ON rr.reward_rule_id = prs.reward_rule_id

      WHERE prs.is_active = 1
      ORDER BY prs.id DESC
    `);

    return rows;
  }

  // Delete product mapping
  async deleteMapping(id) {
    await db.execute(
      `UPDATE product_reward_settings
     SET is_active = 0
     WHERE id = ?`,
      [id],
    );
  }

  // Get wallet balance
  async getWalletForUpdate(conn, user_id) {
    const [rows] = await conn.execute(
      `SELECT balance FROM customer_wallet 
     WHERE user_id = ? FOR UPDATE`,
      [user_id],
    );

    if (!rows.length) {
      throw new Error("Wallet not found");
    }

    return rows[0];
  }

  // update wallet balance
  async updateWalletBalance(conn, user_id, balance) {
    await conn.execute(
      `UPDATE customer_wallet SET balance = ? WHERE user_id = ?`,
      [balance, user_id],
    );
  }
}

module.exports = new RewardModel();
