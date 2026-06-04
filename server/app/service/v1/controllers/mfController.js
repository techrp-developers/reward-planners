const db = require("../../../../config/database");
const MfModel = require("../models/mfModel");

class MfController {
  // Create Section
  async createSection(req, res) {
    try {
      const { category_id, title, icon, sort_order } = req.body;

      if (!category_id || !title) {
        return res.status(400).json({
          success: false,
          message: "category_id and title are required",
        });
      }

      const id = await MfModel.createSection({
        category_id,
        title,
        icon,
        sort_order,
      });

      return res.status(201).json({
        success: true,
        message: "Content section created successfully",
        data: { id },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Get Sections By Category
  async getSectionsByCategory(req, res) {
    try {
      const { categoryId } = req.params;

      const sections = await MfModel.findByCategoryId(categoryId);

      return res.json({
        success: true,
        data: sections,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new MfController();
