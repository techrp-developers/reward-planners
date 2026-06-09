const GlobalModel = require("../models/globalModel");
const db = require("../../../config/database");
const fs = require("fs");
const path = require("path");

class GlobalController {
  // get balance
  async getGlobalSuggestions(req, res) {
    try {
      const search = (req.query.q || "").trim();

      if (!search || search.length < 2) {
        return res.json({
          success: true,
          data: {},
        });
      }

      const data = await GlobalModel.getGlobalSuggestions(search);

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get app status
  async getAppStatus(req, res) {
    try {
      const [rows] = await db.execute(`
      SELECT
        maintenance_mode,
        drain_mode,
        maintenance_start_at
      FROM app_settings
      LIMIT 1
    `);

      return res.json({
        success: true,
        data: rows[0],
      });
    } catch (error) {
      throw error;
    }
  }
}
module.exports = new GlobalController();
