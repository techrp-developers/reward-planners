const db = require("../config/database");
const MaintenanceModel = require("../models/maintenanceModel");

class MaintenanceController {
  async updateMaintenanceSettings(req, res) {
    try {
      const { maintenance_mode, drain_mode, maintenance_start_at } = req.body;

      await MaintenanceModel.updateMaintenanceSettings({
        maintenance_mode,
        drain_mode,
        maintenance_start_at,
      });

      return res.status(200).json({
        success: true,
        message: "Maintenance settings updated successfully",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new MaintenanceController();
