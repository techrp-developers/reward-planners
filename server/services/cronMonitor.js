const db = require("../config/database");
const { sendOpsAlert } = require("./alertService");

// ==========================
// PING — call at end of each successful cron run
// ==========================
async function cronPing(cronName) {
  try {
    await db.query(
      `INSERT INTO cron_heartbeats (cron_name, last_run_at)
       VALUES (?, NOW())
       ON DUPLICATE KEY UPDATE last_run_at = NOW()`,
      [cronName]
    );
  } catch (err) {
    console.error(`[CRON_MONITOR] Failed to ping ${cronName}:`, err.message);
  }
}

// ==========================
// CHECK — call on app startup and every hour
// Alerts if a cron hasn't run within its expected window
// ==========================
async function checkCronHealth() {
  const expectedIntervals = {
    "tracking_cron":      45,  // should run every 30 min, alert if >45 min gap
    "booking_retry_cron": 20,  // should run every 10 min, alert if >20 min gap
    "order_expiry_cron":  10,  // should run every 5 min, alert if >10 min gap
  };

  try {
    const [rows] = await db.query(
      `SELECT cron_name, last_run_at FROM cron_heartbeats`
    );

    const now = Date.now();

    for (const [cronName, maxGapMinutes] of Object.entries(expectedIntervals)) {
      const row = rows.find((r) => r.cron_name === cronName);

      if (!row) {
        await sendOpsAlert({
          level: "critical",
          category: "cron_health",
          message: `Cron ${cronName} has never run — may not be registered`,
          meta: { cronName },
        });
        continue;
      }

      const gapMinutes = (now - new Date(row.last_run_at).getTime()) / 60000;

      if (gapMinutes > maxGapMinutes) {
        await sendOpsAlert({
          level: "critical",
          category: "cron_health",
          message: `Cron ${cronName} last ran ${Math.round(gapMinutes)} min ago — may be stuck`,
          meta: { cronName, lastRunAt: row.last_run_at, gapMinutes: Math.round(gapMinutes) },
        });
      }
    }
  } catch (err) {
    console.error("[CRON_MONITOR] Health check failed:", err.message);
  }
}

module.exports = { cronPing, checkCronHealth };