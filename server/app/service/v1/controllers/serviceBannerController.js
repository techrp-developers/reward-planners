const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");
const ServiceBannerModel = require("../models/serviceBannerModel");
const { uploadToR2 } = require("../../../../utils/r2upload");

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
