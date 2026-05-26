const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");
const ServiceBannerModel = require("../models/serviceBannerModel");
const { UPLOAD_BASE } = require("../../../../config/path");
const sharp = require("sharp");
const { uploadToR2 } = require("../../../../utils/r2upload");
const { deleteFromR2 } = require("../../../../utils/r2delete");

class ServiceBannerController {
  // Create banner
  async createBanner(req, res) {
    try {
      const {
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

      // generate R2 key
      const fileName = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 8)}-${req.file.originalname}`;

      const imageKey = `public/service-banners/${fileName}`;

      // upload to R2
      await uploadToR2(req.file.path, imageKey, req.file.mimetype);

      // cleanup temp file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      // create banner
      const banner = await ServiceBannerModel.create({
        title,
        subtitle,
        image_url: imageKey,
        redirect_type,
        redirect_id,
        redirect_url,
        sort_order,
      });

      res.json({
        success: true,
        message: "Banner created successfully",
        data: banner,
      });
    } catch (err) {
      // cleanup temp file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Update banner
  async updateBanner(req, res) {
    try {
      const { id } = req.params;

      const {
        title,
        subtitle,
        redirect_type,
        redirect_id,
        redirect_url,
        sort_order,
        is_active,
      } = req.body;

      // existing banner
      const existing = await ServiceBannerModel.findById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Banner not found",
        });
      }

      let imageKey = existing.image_url;

      // new image uploaded
      if (req.file) {
        // validate image
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: "Invalid image file",
          });
        }

        const extension = path.extname(req.file.originalname);

        const filename = `banner-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}${extension}`;

        // new R2 path
        imageKey = `public/service-banners/${id}/${filename}`;

        // upload to R2
        await uploadToR2(req.file.path, imageKey, req.file.mimetype);

        // delete old image from R2
        if (existing.image_url) {
          try {
            await deleteFromR2(existing.image_url);
          } catch (deleteErr) {
            console.error("OLD BANNER DELETE ERROR:", deleteErr);
          }
        }

        // cleanup temp file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }

      // update banner
      await ServiceBannerModel.update(id, {
        title: title ?? existing.title,
        subtitle: subtitle ?? existing.subtitle,
        image_url: imageKey,
        redirect_type: redirect_type ?? existing.redirect_type,
        redirect_id: redirect_id ?? existing.redirect_id,
        redirect_url: redirect_url ?? existing.redirect_url,
        sort_order: sort_order ?? existing.sort_order,
        is_active: is_active ?? existing.is_active,
      });

      res.json({
        success: true,
        message: "Banner updated successfully",
        data: {
          image_url: imageKey,
        },
      });
    } catch (err) {
      console.error("UPDATE BANNER ERROR:", err);

      // cleanup temp file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
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
}

module.exports = new ServiceBannerController();
