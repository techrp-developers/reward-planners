const db = require("../../config/database");

// Read-only, active-only view of the shared reward_rules table — same table
// the vendor-manager's Reward Mapping screen manages, just exposed here
// without the vendor_manager-only auth gate so a flea market manager can
// pick a rule while quick-creating a product (see productQuickCreateService).
class RewardRuleModel {
  async findAllActive() {
    const [rows] = await db.execute(
      `SELECT reward_rule_id, name, reward_type, reward_value FROM reward_rules WHERE is_active = 1 ORDER BY name ASC`,
    );
    return rows;
  }
}

module.exports = new RewardRuleModel();
