const db = require("../config/database");
const MaintenanceModel = require("../models/maintenanceModel");

class MaintenanceController {
  async updateMaintenanceSettings(req, res) {
    try {
      const {
        maintenance_mode,
        drain_mode,
        maintenance_start_at,
        maintenance_end_at,
      } = req.body;

      if (
        maintenance_start_at &&
        maintenance_end_at &&
        new Date(maintenance_end_at) <= new Date(maintenance_start_at)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "maintenance_end_at must be greater than maintenance_start_at",
        });
      }

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
