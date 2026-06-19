const cron = require("node-cron");
const db = require("../../config/database");
const { cronPing, checkCronHealth } = require("../../services/cronMonitor");

cron.schedule("* * * * *", async () => {
  try {
    const [rows] = await db.execute(`
      SELECT
        id,
        drain_mode,
        maintenance_mode,
        maintenance_start_at,
        maintenance_end_at
      FROM app_settings
      LIMIT 1
    `);

    if (!rows.length) return;

    const settings = rows[0];
    const now = new Date();

    // ===============================
    // START MAINTENANCE
    // ===============================
    if (
      settings.drain_mode &&
      !settings.maintenance_mode &&
      settings.maintenance_start_at &&
      now >= new Date(settings.maintenance_start_at)
    ) {
      await db.execute(
        `
        UPDATE app_settings
        SET maintenance_mode = 1
        WHERE id = ?
        `,
        [settings.id],
      );

      console.log("🚧 Maintenance mode enabled automatically");
    }

    // ===============================
    // END MAINTENANCE
    // ===============================
    if (
      settings.maintenance_mode &&
      settings.maintenance_end_at &&
      now >= new Date(settings.maintenance_end_at)
    ) {
      await db.execute(
        `
        UPDATE app_settings
        SET
          maintenance_mode = 0,
          drain_mode = 0,
          maintenance_start_at = NULL,
          maintenance_end_at = NULL
        WHERE id = ?
        `,
        [settings.id],
      );

      console.log("✅ Maintenance mode disabled automatically");
    }
    await cronPing("maintenance_cron");
  } catch (error) {
    console.error("Maintenance Cron Error:", error.message);
  }
});

console.log("✅ Maintenance cron started");
