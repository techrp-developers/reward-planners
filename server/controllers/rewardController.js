const RewardModel = require("../models/rewardModel");
const RewardService = require("../services/Reward/reward-service");
const db = require("../config/database");

class RewardController {
  // CREATE RULE
  async createRule(req, res) {
    try {
      const {
        name,
        reward_type,
        reward_value,
        max_reward,
        min_order_amount,
        max_order_amount,
        source_type,
        description,
        start_date,
        end_date,
        priority = 1,
        is_stackable = 0,
        expiry_days = 90,
      } = req.body;

      if (!reward_type || !reward_value || !source_type) {
        return res.status(400).json({
          success: false,
          message: "Required fields missing",
        });
      }

      const [result] = await db.execute(
        `INSERT INTO reward_rules 
      (name, reward_type, reward_value, max_reward, min_order_amount, max_order_amount, source_type, description, start_date, end_date, priority, is_stackable, expiry_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          reward_type,
          reward_value,
          max_reward || null,
          min_order_amount || 0,
          max_order_amount || 0,
          source_type,
          description || null,
          start_date || null,
          end_date || null,
          priority,
          is_stackable,
          expiry_days,
        ],
      );

      return res.json({
        success: true,
        message: "Reward rule created",
        data: { reward_rule_id: result.insertId },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // GET RULES
  async getRules(req, res) {
    try {
      const [rows] = await db.execute(
        `SELECT * FROM reward_rules WHERE is_active = 1`,
      );

      return res.json({
        success: true,
        data: rows,
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // GET RULE BY ID
  async getRewardRuleById(req, res) {
    try {
      const { id } = req.params;

      const query = `SELECT * FROM reward_rules WHERE reward_rule_id = ?`;
      const [rows] = await db.execute(query, [id]);

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Reward rule not found",
        });
      }

      return res.json({
        success: true,
        data: rows[0],
      });
    } catch (err) {
      console.error("Get Rule Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // UPDATE RULE
  async updateRewardRule(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Reward rule ID is required",
        });
      }

      const {
        name,
        reward_type,
        reward_value,
        max_reward,
        min_order_amount,
        max_order_amount,
        is_active,
        source_type,
        description,
        start_date,
        end_date,
        priority,
        is_stackable,
        expiry_days,
      } = req.body;

      const [result] = await db.execute(
        `UPDATE reward_rules
       SET 
        name = ?,
        reward_type = ?,
        reward_value = ?,
        max_reward = ?,
        min_order_amount = ?,
        max_order_amount = ?,
        is_active = ?,
        source_type = ?,
        description = ?,
        start_date = ?,
        end_date = ?,
        priority = ?,
        is_stackable = ?,
        expiry_days = ?
       WHERE reward_rule_id = ?`,
        [
          name,
          reward_type,
          reward_value,
          max_reward,
          min_order_amount,
          max_order_amount,
          is_active,
          source_type,
          description,
          start_date,
          end_date,
          priority,
          is_stackable,
          expiry_days,
          id,
        ],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Reward rule not found",
        });
      }

      return res.json({
        success: true,
        message: "Reward rule updated",
      });
    } catch (err) {
      console.error("Update Rule Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // DEACTIVATE RULE
  async deleteRewardRule(req, res) {
    try {
      const { id } = req.params;

      const query = `
      UPDATE reward_rules
      SET is_active = 0
      WHERE reward_rule_id = ?
    `;

      const [result] = await db.execute(query, [id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Reward rule not found",
        });
      }

      return res.json({
        success: true,
        message: "Reward rule deactivated",
      });
    } catch (err) {
      console.error("Delete Rule Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // MAP PRODUCT
  async mapProductReward(req, res) {
    try {
      const {
        product_id,
        variant_id,
        category_id,
        subcategory_id,
        reward_rule_id,
      } = req.body;

      if (!reward_rule_id) {
        return res.status(400).json({
          success: false,
          message: "reward_rule_id is required",
        });
      }

      const targets = [
        variant_id ? 1 : 0,
        product_id ? 1 : 0,
        subcategory_id ? 1 : 0,
        category_id ? 1 : 0,
      ];

      if (targets.reduce((a, b) => a + b, 0) > 1) {
        return res.status(400).json({
          success: false,
          message: "Only one targeting level allowed",
        });
      }

      const id = await RewardModel.mapRewardToProduct(req.body);

      return res.json({
        success: true,
        message: "Mapped successfully",
        data: { id },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // Get product mapping
  async getProductRewardMappings(req, res) {
    try {
      const data = await RewardModel.getProductRewardMappings();

      return res.json({
        success: true,
        data,
      });
    } catch (err) {
      console.error("Fetch Mapping Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Delete product mapping
  async deleteProductRewardMapping(req, res) {
    try {
      const { id } = req.params;

      await RewardModel.deleteMapping(id);

      return res.json({
        success: true,
        message: "Mapping removed",
      });
    } catch (err) {
      console.error("Delete Mapping Error:", err);
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // APPLY REWARD (CALL THIS IN ORDER FLOW)
  async applyReward(req, res) {
    try {
      const { user_id, product_id, variant_id, order_id, order_amount } =
        req.body;

      if (!user_id || !product_id || !order_id || !order_amount) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      // Fetch category + subcategory
      const [product] = await db.execute(
        `SELECT category_id, subcategory_id 
       FROM eproducts 
       WHERE product_id = ?`,
        [product_id],
      );

      if (!product.length) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const { category_id, subcategory_id } = product[0];

      const result = await RewardService.processOrderReward({
        user_id,
        product_id,
        variant_id,
        order_id,
        order_amount,
        category_id,
        subcategory_id,
      });

      return res.json({
        success: true,
        message: "Reward processed",
        data: result,
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = new RewardController();
