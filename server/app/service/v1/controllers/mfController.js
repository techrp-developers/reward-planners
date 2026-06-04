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

  // update section
  async updateSection(req, res) {
    try {
      const { id } = req.params;

      const existing = await MfModel.findById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Content section not found",
        });
      }

      const updatedData = {
        title: req.body.title ?? existing.title,
        icon: req.body.icon ?? existing.icon,
        sort_order: req.body.sort_order ?? existing.sort_order,
        status: req.body.status ?? existing.status,
      };

      await MfModel.update(id, updatedData);

      return res.json({
        success: true,
        message: "Content section updated successfully",
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
