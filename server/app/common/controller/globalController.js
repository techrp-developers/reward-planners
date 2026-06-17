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

  async creditWallet(req, res) {
    try {
      const {
        email,
        coins,
        title = "Reward Points Credited",
        description = "Reward points have been credited to your account",
      } = req.body;

      if (!email || !coins || Number(coins) <= 0) {
        return res.status(400).json({
          success: false,
          message: "Email and valid coins are required",
        });
      }

      const result = await GlobalModel.creditWalletByEmail({
        email,
        coins: Number(coins),
        title,
        description,
      });

      return res.json({
        success: true,
        message: "Reward points credited successfully",
        data: result,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
}
module.exports = new GlobalController();
