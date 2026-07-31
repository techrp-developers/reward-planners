const db = require("../../config/database");

// Read-only, active-only view of the shared reward_rules table — same table
// the vendor-manager's Reward Mapping screen manages, just exposed here
// without the vendor_manager-only auth gate so a flea market manager can
// pick a rule while quick-creating a product (see productQuickCreateService).
//
// Only rules with redemption_type/redemption_value set are returned —
// rewardCalculate.resolveRedemption unconditionally rejects any rule missing
// either (see its `!rule.redemption_type || rule.redemption_value == null`
// guard), so an earn-only rule offered under a "Redeem Reward Rule" picker
// would map successfully but never actually enable redemption at checkout —
// exactly the bug this list exists to prevent.
class RewardRuleModel {
  async findAllRedeemable() {
    const [rows] = await db.execute(
      `SELECT reward_rule_id, name, reward_type, reward_value, redemption_type, redemption_value, min_order_amount, max_order_amount
       FROM reward_rules
       WHERE is_active = 1 AND redemption_type IS NOT NULL AND redemption_value IS NOT NULL
       ORDER BY min_order_amount ASC, name ASC`,
    );
    return rows;
  }
}

module.exports = new RewardRuleModel();
