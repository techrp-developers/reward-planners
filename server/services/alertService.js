const db = require("../config/database");

// ==========================
// You can swap this body for Slack, PagerDuty,
// email via nodemailer, etc.
// For now it writes to an ops_alerts table
// and logs to console for immediate visibility
// ==========================
async function sendOpsAlert({ level = "error", category, message, meta = {} }) {
  console.error(`[OPS_ALERT][${level.toUpperCase()}][${category}]`, message, meta);

  try {
    await db.query(
      `INSERT INTO ops_alerts (level, category, message, meta, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [level, category, message, JSON.stringify(meta)]
    );
  } catch (err) {
    // Don't let alert failure crash anything
    console.error("[OPS_ALERT] Failed to write alert to DB:", err.message);
  }
}

module.exports = { sendOpsAlert };