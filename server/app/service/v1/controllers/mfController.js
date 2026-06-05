const db = require("../../../../config/database");
const MfModel = require("../models/mfModel");

class MfController {
  // Create Section
  async createSection(req, res) {
    try {
      const { category_id, parent_section_id, title, icon, sort_order } =
        req.body;

      if (!category_id || !title) {
        return res.status(400).json({
          success: false,
          message: "category_id and title are required",
        });
      }

      const id = await MfModel.createSection({
        category_id,
        parent_section_id: parent_section_id || null,
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

      const existing = await MfModel.findSectionById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Content section not found",
        });
      }

      const updatedData = {
        title: req.body.title ?? existing.title,
        icon: req.body.icon ?? existing.icon,
        parent_section_id:
          req.body.parent_section_id ?? existing.parent_section_id,
        sort_order: req.body.sort_order ?? existing.sort_order,
        status: req.body.status ?? existing.status,
      };

      await MfModel.updateSection(id, updatedData);

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

  // Delete section
  async deleteSection(req, res) {
    try {
      const { id } = req.params;

      const affected = await MfModel.deleteSection(id);

      if (!affected) {
        return res.status(404).json({
          success: false,
          message: "Content section not found",
        });
      }

      return res.json({
        success: true,
        message: "Content section removed successfully",
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ====================================================================Article==================================================
  async createArticle(req, res) {
    try {
      const {
        section_id,
        title,
        short_description,
        thumbnail,
        banner_image,
        article_content,
        cta_text,
        sort_order,
      } = req.body;

      if (!section_id || !title) {
        return res.status(400).json({
          success: false,
          message: "section_id and title are required",
        });
      }

      const id = await MfModel.createArticle({
        section_id,
        title,
        short_description,
        thumbnail,
        banner_image,
        article_content,
        cta_text,
        sort_order,
      });

      return res.status(201).json({
        success: true,
        message: "Article created successfully",
        data: { id },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getArticlesBySection(req, res) {
    try {
      const { sectionId } = req.params;

      const articles = await MfModel.findBySectionId(sectionId);

      return res.json({
        success: true,
        data: articles,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getArticleById(req, res) {
    try {
      const { id } = req.params;

      const article = await MfModel.findById(id);

      if (!article) {
        return res.status(404).json({
          success: false,
          message: "Article not found",
        });
      }

      return res.json({
        success: true,
        data: article,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async updateArticle(req, res) {
    try {
      const { id } = req.params;

      const existing = await MfModel.findById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Article not found",
        });
      }

      const updatedData = {
        title: req.body.title ?? existing.title,
        short_description:
          req.body.short_description ?? existing.short_description,

        thumbnail: req.body.thumbnail ?? existing.thumbnail,

        banner_image: req.body.banner_image ?? existing.banner_image,

        article_content: req.body.article_content ?? existing.article_content,

        cta_text: req.body.cta_text ?? existing.cta_text,

        sort_order: req.body.sort_order ?? existing.sort_order,

        status: req.body.status ?? existing.status,
      };

      await MfModel.updateArticle(id, updatedData);

      return res.json({
        success: true,
        message: "Article updated successfully",
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async deleteArticle(req, res) {
    try {
      const { id } = req.params;

      const affected = await MfModel.deleteArticle(id);

      if (!affected) {
        return res.status(404).json({
          success: false,
          message: "Article not found",
        });
      }

      return res.json({
        success: true,
        message: "Article removed successfully",
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ====================================child sections=====================================================
  async getChildSections(req, res) {
    try {
      const { parentId } = req.params;

      const sections = await MfModel.findChildSections(parentId);

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

  async getSectionById(req, res) {
    try {
      const { id } = req.params;

      const section = await MfModel.findSectionById(id);

      if (!section) {
        return res.status(404).json({
          success: false,
          message: "Section not found",
        });
      }

      return res.json({
        success: true,
        data: section,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getCategoryTree(req, res) {
    try {
      const { categoryId } = req.params;

      const tree = await MfModel.getCategoryTree(categoryId);

      return res.json({
        success: true,
        data: tree,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getSectionContent(req, res) {
    try {
      const { id } = req.params;

      const section = await MfModel.findSectionById(id);

      if (!section) {
        return res.status(404).json({
          success: false,
          message: "Section not found",
        });
      }

      const articles = await MfModel.findBySectionId(id);

      return res.json({
        success: true,
        data: {
          section,
          articles,
        },
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
