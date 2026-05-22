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

    // ensure only one targeting level
    const targets = [
      variant_id ? 1 : 0,
      product_id ? 1 : 0,
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
      `SELECT id FROM product_reward_settings WHERE ${where}`,
      params,
    );

    if (existing.length > 0) {
      const id = existing[0].id;

      await db.execute(
        `UPDATE product_reward_settings
       SET reward_rule_id = ?, can_earn_reward = ?, can_redeem_reward = ?, priority = ?, is_active = 1
       WHERE id = ?`,
        [reward_rule_id, can_earn_reward, can_redeem_reward, priority, id],
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
  async getProductRewards(
    product_id,
    variant_id,
    category_id,
    subcategory_id,
    order_amount,
  ) {
    const [rows] = await db.execute(
      `
    SELECT prs.*, rr.*
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
      AND (rr.max_order_amount IS NULL OR ? <= rr.max_order_amount)
    ORDER BY 
      CASE
        WHEN prs.variant_id IS NOT NULL THEN 1
        WHEN prs.product_id IS NOT NULL THEN 2
        WHEN prs.subcategory_id IS NOT NULL THEN 3
        WHEN prs.category_id IS NOT NULL THEN 4
        ELSE 5
      END,
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

    const EXPIRY_MONTHS = parseInt(process.env.WALLET_EXPIRY_MONTHS || "3", 10);

    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + EXPIRY_MONTHS);

    await conn.execute(
      `INSERT INTO wallet_transactions
    (user_id, title, description, transaction_type, coins, balance_after, category, reference_id, expiry_date, reason_code, expiry_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        title,
        description,
        type,
        coins,
        balance_after || null,
        category,
        reference_id,
        expiry_date || null,
        reason_code || "ORDER_REWARD",
        expiryDate,
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
