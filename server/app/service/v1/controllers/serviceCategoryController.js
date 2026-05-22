const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");
const ServiceCategoryModel = require("../models/serviceCategoryModel");
const { UPLOAD_BASE } = require("../../../../config/path");
const sharp = require("sharp");
const { uploadToR2 } = require("../../../../utils/r2upload");

const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class ServiceCatalogController {
  // Find all categories
  async getCategories(req, res) {
    try {
      const categories = await ServiceCategoryModel.findAll(true);

      res.json({
        success: true,
        data: categories,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // create category
  async createCategory(req, res) {
    try {
      const { name, status } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Category name is required",
        });
      }

      // 1. Create category
      const categoryId = await ServiceCategoryModel.create({
        name,
        icon: null,
        status,
      });

      let iconPath = null;

      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: "Invalid image file",
          });
        }

        // read original image
        const fileBuffer = fs.readFileSync(req.file.path);

        // preserve original extension
        const ext = path.extname(req.file.originalname);

        const filename = `category-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}${ext}`;

        // R2 path
        iconPath = `public/service-category/${categoryId}/${filename}`;

        // upload original image
        await uploadToR2(fileBuffer, iconPath, req.file.mimetype);

        // remove temp file
        fs.unlinkSync(req.file.path);

        // update DB
        await ServiceCategoryModel.update(categoryId, {
          name,
          icon: iconPath,
          status,
        });
      }

      res.status(201).json({
        success: true,
        message: "Service category created successfully",
        data: {
          id: categoryId,
          icon: iconPath,
        },
      });
    } catch (err) {
      console.error("CREATE CATEGORY ERROR:", err);

      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Get category By Id
  async getCategoryById(req, res) {
    try {
      const { id } = req.params;

      const category = await ServiceCategoryModel.findById(id);

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      res.json({
        success: true,
        data: category,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Update category
  async updateCategory(req, res) {
    try {
      const { id } = req.params;

      const { name, status } = req.body;

      // 1. Fetch existing category
      const existing = await ServiceCategoryModel.findById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      let iconPath = existing.icon;

      // 2. If new icon uploaded → replace
      if (req.file) {
        // read original file buffer
        const fileBuffer = fs.readFileSync(req.file.path);

        // keep original extension
        const ext = path.extname(req.file.originalname);

        const filename = `icon-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}${ext}`;

        const r2Path = `public/service-category/${id}/${filename}`;

        // upload original image without compression
        await uploadToR2(fileBuffer, r2Path, req.file.mimetype);

        // remove temp multer file
        fs.unlinkSync(req.file.path);

        // set new icon path
        iconPath = r2Path;

        // OPTIONAL:
        // delete old R2 image here if needed
      }

      // 3. Update DB
      await ServiceCategoryModel.update(id, {
        name: name ?? existing.name,
        icon: iconPath,
        status: status ?? existing.status,
      });

      res.json({
        success: true,
        message: "Service category updated successfully",
        data: {
          icon: iconPath,
        },
      });
    } catch (err) {
      // Cleanup temp file if error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Delete Category
  async deleteCategory(req, res) {
    try {
      const { id } = req.params;

      const affected = await ServiceCategoryModel.delete(id);

      if (!affected) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      res.json({
        success: true,
        message: "Service category removed successfully",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new ServiceCatalogController();
