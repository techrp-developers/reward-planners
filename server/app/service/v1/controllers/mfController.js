const db = require("../../../../config/database");
const MfModel = require("../models/mfModel");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { uploadToR2 } = require("../../../../utils/r2upload");
const { deleteFromR2 } = require("../../../../utils/r2delete");

const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class MfController {
  // Create Section
  async createSection(req, res) {
    try {
      const { category_id, parent_section_id, title, sort_order } = req.body;

      if (!category_id || !title) {
        return res.status(400).json({
          success: false,
          message: "category_id and title are required",
        });
      }

      const sectionId = await MfModel.createSection({
        category_id,
        parent_section_id: parent_section_id || null,
        title,
        icon: null,
        sort_order,
      });

      let imagePath = null;

      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: "Invalid image file",
          });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        const extension = path.extname(req.file.originalname);

        const filename = `section-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}${extension}`;

        imagePath = `public/sections/${sectionId}/${filename}`;

        await uploadToR2(fileBuffer, imagePath, req.file.mimetype);

        fs.unlinkSync(req.file.path);

        await MfModel.updateSectionIcon(sectionId, imagePath);
      }

      return res.status(201).json({
        success: true,
        message: "Content section created successfully",
        data: {
          id: sectionId,
          icon: imagePath,
        },
      });
    } catch (err) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

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

      let imagePath = existing.icon;

      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: "Invalid image file",
          });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        const extension = path.extname(req.file.originalname);

        const filename = `section-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}${extension}`;

        imagePath = `public/sections/${id}/${filename}`;

        await uploadToR2(fileBuffer, imagePath, req.file.mimetype);

        if (existing.icon) {
          try {
            await deleteFromR2(existing.icon);
          } catch (err) {
            console.error("OLD ICON DELETE ERROR:", err);
          }
        }

        fs.unlinkSync(req.file.path);
      }

      const updatedData = {
        title: req.body.title ?? existing.title,
        icon: imagePath,
        parent_section_id:
          req.body.parent_section_id ?? existing.parent_section_id,
        sort_order: req.body.sort_order ?? existing.sort_order,
        status: req.body.status ?? existing.status,
      };

      await MfModel.updateSection(id, updatedData);

      return res.json({
        success: true,
        message: "Content section updated successfully",
        data: {
          icon: imagePath,
        },
      });
    } catch (err) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

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

      const articleId = await MfModel.createArticle({
        section_id,
        title,
        short_description,
        thumbnail: null,
        banner_image: null,
        article_content,
        cta_text,
        sort_order,
      });

      let thumbnailPath = null;
      let bannerPath = null;

      // Thumbnail Upload
      if (req.files?.thumbnail?.[0]) {
        const file = req.files.thumbnail[0];

        const extension = path.extname(file.originalname);

        const filename = `thumbnail-${Date.now()}${extension}`;

        thumbnailPath = `public/mf-articles/${articleId}/${filename}`;

        await uploadToR2(
          fs.readFileSync(file.path),
          thumbnailPath,
          file.mimetype,
        );

        fs.unlinkSync(file.path);
      }

      // Banner Upload
      if (req.files?.banner_image?.[0]) {
        const file = req.files.banner_image[0];

        const extension = path.extname(file.originalname);

        const filename = `banner-${Date.now()}${extension}`;

        bannerPath = `public/mf-articles/${articleId}/${filename}`;

        await uploadToR2(fs.readFileSync(file.path), bannerPath, file.mimetype);

        fs.unlinkSync(file.path);
      }

      await MfModel.updateArticleImages(articleId, thumbnailPath, bannerPath);

      return res.status(201).json({
        success: true,
        message: "Article created successfully",
        data: {
          id: articleId,
          thumbnail: thumbnailPath,
          banner_image: bannerPath,
        },
      });
    } catch (err) {
      console.error(err);

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

      let thumbnailPath = existing.thumbnail;
      let bannerPath = existing.banner_image;

      // Thumbnail
      if (req.files?.thumbnail?.[0]) {
        const file = req.files.thumbnail[0];

        const extension = path.extname(file.originalname);

        const filename = `thumbnail-${Date.now()}${extension}`;

        thumbnailPath = `public/mf-articles/${id}/${filename}`;

        await uploadToR2(
          fs.readFileSync(file.path),
          thumbnailPath,
          file.mimetype,
        );

        if (existing.thumbnail) {
          await deleteFromR2(existing.thumbnail).catch(console.error);
        }

        fs.unlinkSync(file.path);
      }

      // Banner
      if (req.files?.banner_image?.[0]) {
        const file = req.files.banner_image[0];

        const extension = path.extname(file.originalname);

        const filename = `banner-${Date.now()}${extension}`;

        bannerPath = `public/mf-articles/${id}/${filename}`;

        await uploadToR2(fs.readFileSync(file.path), bannerPath, file.mimetype);

        if (existing.banner_image) {
          await deleteFromR2(existing.banner_image).catch(console.error);
        }

        fs.unlinkSync(file.path);
      }

      const updatedData = {
        title: req.body.title ?? existing.title,

        short_description:
          req.body.short_description ?? existing.short_description,

        thumbnail: thumbnailPath,

        banner_image: bannerPath,

        article_content: req.body.article_content ?? existing.article_content,

        cta_text: req.body.cta_text ?? existing.cta_text,

        sort_order: req.body.sort_order ?? existing.sort_order,

        status: req.body.status ?? existing.status,
      };

      await MfModel.updateArticle(id, updatedData);

      return res.json({
        success: true,
        message: "Article updated successfully",
        data: {
          thumbnail: thumbnailPath,
          banner_image: bannerPath,
        },
      });
    } catch (err) {
      console.error(err);

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
