const db = require("../config/database");

class MaintenanceModel {
  async updateMaintenanceSettings(data) {
    const { maintenance_mode, drain_mode, maintenance_start_at } = data;

    await db.execute(
      `
  UPDATE app_settings
  SET
    maintenance_mode = ?,
    drain_mode = ?,
    maintenance_start_at = ?,
    maintenance_end_at = ?
  WHERE id = 1
  `,
      [maintenance_mode, drain_mode, maintenance_start_at, maintenance_end_at],
    );

    return true;
  }
}

module.exports = new MaintenanceModel();
