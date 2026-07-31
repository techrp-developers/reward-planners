const rewardRuleModel = require("../models/rewardRuleModel");

class RewardRuleController {
  async list(req, res) {
    try {
      const rows = await rewardRuleModel.findAllRedeemable();
      return res.json({
        success: true,
        data: rows.map((row) => ({
          rewardRuleId: row.reward_rule_id,
          name: row.name,
          rewardType: row.reward_type,
          rewardValue: Number(row.reward_value),
          redemptionType: row.redemption_type,
          redemptionValue: Number(row.redemption_value),
          minOrderAmount: Number(row.min_order_amount),
          maxOrderAmount: row.max_order_amount != null ? Number(row.max_order_amount) : null,
        })),
      });
    } catch (error) {
      console.error("[flea-market][reward-rules] error:", error);
      return res.status(500).json({ success: false, message: "Failed to fetch reward rules" });
    }
  }
}

module.exports = new RewardRuleController();
