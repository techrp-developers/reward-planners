const rewardRuleModel = require("../models/rewardRuleModel");

class RewardRuleController {
  async list(req, res) {
    try {
      const rows = await rewardRuleModel.findAllActive();
      return res.json({
        success: true,
        data: rows.map((row) => ({
          rewardRuleId: row.reward_rule_id,
          name: row.name,
          rewardType: row.reward_type,
          rewardValue: Number(row.reward_value),
        })),
      });
    } catch (error) {
      console.error("[flea-market][reward-rules] error:", error);
      return res.status(500).json({ success: false, message: "Failed to fetch reward rules" });
    }
  }
}

module.exports = new RewardRuleController();
