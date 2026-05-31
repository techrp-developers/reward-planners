const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");
const ServiceBannerModel = require("../models/serviceBannerModel");
const { uploadToR2 } = require("../../../../utils/r2upload");
const { deleteFromR2 } = require("../../../../utils/r2delete");

class ServiceBannerController {
  // Create banner
  async createBanner(req, res) {
    try {
      let {
        title,
        subtitle,
        redirect_type,
        redirect_id,
        redirect_url,
        sort_order,
      } = req.body;

      // image required
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Banner image is required",
        });
      }

      // validate image
      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({
          success: false,
          message: "Invalid image file",
        });
      }

      // =====================================
      // Validate redirect type
      // =====================================

      const allowedRedirectTypes = ["service", "bundle", "external"];

      if (redirect_type && !allowedRedirectTypes.includes(redirect_type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid redirect_type",
        });
      }

      // =====================================
      // Validate redirect fields
      // =====================================

      if (redirect_type === "external" && !redirect_url) {
        return res.status(400).json({
          success: false,
          message: "redirect_url required for external banners",
        });
      }

      if (["service", "bundle"].includes(redirect_type) && !redirect_id) {
        return res.status(400).json({
          success: false,
          message: "redirect_id required",
        });
      }

      // =====================================
      // Validate Service
      // =====================================

      if (redirect_type === "service") {
        const [[service]] = await db.execute(
          `
        SELECT id
        FROM services
        WHERE id = ?
        `,
          [redirect_id],
        );

        if (!service) {
          return res.status(400).json({
            success: false,
            message: "Invalid service",
          });
        }
      }

      // =====================================
      // Validate Bundle
      // =====================================

      if (redirect_type === "bundle") {
        const [[bundle]] = await db.execute(
          `
        SELECT id
        FROM service_bundles
        WHERE id = ?
        `,
          [redirect_id],
        );

        if (!bundle) {
          return res.status(400).json({
            success: false,
            message: "Invalid bundle",
          });
        }
      }

      // =====================================
      // Cleanup Redirect Data
      // =====================================

      let finalRedirectId = redirect_id || null;

      let finalRedirectUrl = redirect_url || null;

      if (redirect_type === "external") {
        finalRedirectId = null;
      }

      if (["service", "bundle"].includes(redirect_type)) {
        finalRedirectUrl = null;
      }

      // =====================================
      // Upload Image
      // =====================================

      const fileBuffer = fs.readFileSync(req.file.path);

      const fileName = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 8)}-${req.file.originalname}`;

      const imageKey = `public/service-banners/${fileName}`;

      await uploadToR2(fileBuffer, imageKey, req.file.mimetype);

      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      // =====================================
      // Create Banner
      // =====================================

      const banner = await ServiceBannerModel.create({
        title,
        subtitle,
        image_url: imageKey,
        redirect_type,
        redirect_id: finalRedirectId,
        redirect_url: finalRedirectUrl,
        sort_order,
      });

      return res.json({
        success: true,
        message: "Banner created successfully",
        data: banner,
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

  // Update banner
  async updateBanner(req, res) {
    try {
      const { id } = req.params;

      let {
        title,
        subtitle,
        redirect_type,
        redirect_id,
        redirect_url,
        sort_order,
        is_active,
      } = req.body;

      // =====================================
      // Existing Banner
      // =====================================

      const existing = await ServiceBannerModel.findById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Banner not found",
        });
      }

      // =====================================
      // Validate redirect type
      // =====================================

      const allowedRedirectTypes = ["service", "bundle", "external"];

      if (redirect_type && !allowedRedirectTypes.includes(redirect_type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid redirect_type",
        });
      }

      // =====================================
      // Final Redirect Values
      // =====================================

      let finalRedirectType = redirect_type ?? existing.redirect_type;

      let finalRedirectId = redirect_id ?? existing.redirect_id;

      let finalRedirectUrl = redirect_url ?? existing.redirect_url;

      // external banner

      if (finalRedirectType === "external") {
        if (!finalRedirectUrl) {
          return res.status(400).json({
            success: false,
            message: "redirect_url required for external banners",
          });
        }

        finalRedirectId = null;
      }

      // service / bundle banner
      if (["service", "bundle"].includes(finalRedirectType)) {
        if (!finalRedirectId) {
          return res.status(400).json({
            success: false,
            message: "redirect_id required",
          });
        }

        finalRedirectUrl = null;
      }

      // =====================================
      // Validate Service
      // =====================================

      if (finalRedirectType === "service") {
        const [[service]] = await db.execute(
          `
          SELECT id
          FROM services
          WHERE id = ?
          `,
          [finalRedirectId],
        );

        if (!service) {
          return res.status(400).json({
            success: false,
            message: "Invalid service",
          });
        }
      }

      // =====================================
      // Validate Bundle
      // =====================================

      if (finalRedirectType === "bundle") {
        const [[bundle]] = await db.execute(
          `
          SELECT id
          FROM service_bundles
          WHERE id = ?
          `,
          [finalRedirectId],
        );

        if (!bundle) {
          return res.status(400).json({
            success: false,
            message: "Invalid bundle",
          });
        }
      }

      // =====================================
      // Image Upload
      // =====================================

      let imageKey = existing.image_url;

      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: "Invalid image file",
          });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        const extension = path.extname(req.file.originalname);

        const filename = `${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}${extension}`;

        imageKey = `public/service-banners/${id}/${filename}`;

        await uploadToR2(fileBuffer, imageKey, req.file.mimetype);

        if (existing.image_url) {
          try {
            await deleteFromR2(existing.image_url);
          } catch (deleteErr) {
            console.error("OLD BANNER DELETE ERROR:", deleteErr);
          }
        }

        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }

      // =====================================
      // Update Banner
      // =====================================

      await ServiceBannerModel.update(id, {
        title: title ?? existing.title,

        subtitle: subtitle ?? existing.subtitle,

        image_url: imageKey,

        redirect_type: finalRedirectType,

        redirect_id: finalRedirectId,

        redirect_url: finalRedirectUrl,

        sort_order: sort_order ?? existing.sort_order,

        is_active: is_active ?? existing.is_active,
      });

      return res.json({
        success: true,
        message: "Banner updated successfully",
        data: {
          image_url: imageKey,
        },
      });
    } catch (err) {
      console.error("UPDATE BANNER ERROR:", err);

      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   Get Banners
  async getBanners(req, res) {
    try {
      const banners = await ServiceBannerModel.getActiveBanners();

      res.json({
        success: true,
        data: banners,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Delete banner
  async deleteBanner(req, res) {
    try {
      const { id } = req.params;

      const banner = await ServiceBannerModel.findById(id);

      if (!banner) {
        return res.status(404).json({
          success: false,
          message: "Banner not found",
        });
      }

      if (banner.image_url) {
        try {
          await deleteFromR2(banner.image_url);
        } catch (err) {
          console.error(err);
        }
      }

      await ServiceBannerModel.delete(id);

      res.json({
        success: true,
        message: "Banner deleted successfully",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Get admin banners
  async getAllBanners(req, res) {
    try {
      const banners = await ServiceBannerModel.getAllBanners();

      res.json({
        success: true,
        data: banners,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new ServiceBannerController();
