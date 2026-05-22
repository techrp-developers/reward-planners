  const db = require("../../../config/database");

  class SettingController {
    async getAppSettings(req, res) {
      try {
        const [rows] = await db.execute(
          `SELECT 
            android_version,
            android_version_code,
            ios_version,
            ios_version_code,
            android_force_update,
            ios_force_update,
            maintenance_mode
        FROM app_settings
        LIMIT 1`,
        );

        const settings = rows[0];

        if (!settings) {
          return res.status(404).json({
            success: false,
            message: "Settings not found",
          });
        }

        return res.status(200).json({
          success: true,
          data: settings,
        });
      } catch (error) {
        console.error("Error fetching app settings:", error);
        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    }
  }

  module.exports = new SettingController();
