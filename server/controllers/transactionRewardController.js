const db = require("../config/database");
const { MODULES, validateSettings } = require("../services/rewards/transactionRewardPolicy");

exports.get = async (req, res) => {
  if (!MODULES.includes(req.params.module)) return res.status(400).json({ success: false, message: "Invalid reward module." });
  try {
    const [[row]] = await db.execute("SELECT * FROM transaction_reward_settings WHERE module = ?", [req.params.module]);
    return res.json({ success: true, data: { ranges: row ? (typeof row.ranges_json === "string" ? JSON.parse(row.ranges_json) : row.ranges_json) : [], expiry_days: row?.expiry_days || 90 } });
  } catch (error) {
    console.error("Read transaction rewards:", error.code);
    return res.status(500).json({ success: false, message: "Unable to load reward ranges." });
  }
};

exports.save = async (req, res) => {
  if (!MODULES.includes(req.params.module)) return res.status(400).json({ success: false, message: "Invalid reward module." });
  let settings;
  try { settings = validateSettings(req.body); }
  catch (error) { return res.status(400).json({ success: false, message: error.message }); }
  try {
    await db.execute(`INSERT INTO transaction_reward_settings (module, ranges_json, expiry_days) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE ranges_json = VALUES(ranges_json), expiry_days = VALUES(expiry_days)`,
    [req.params.module, JSON.stringify(settings.ranges), settings.expiry_days]);
    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error("Save transaction rewards:", error.code);
    return res.status(500).json({ success: false, message: "Unable to save reward ranges." });
  }
};
