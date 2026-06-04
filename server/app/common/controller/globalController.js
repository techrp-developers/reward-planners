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
}
module.exports = new GlobalController();
