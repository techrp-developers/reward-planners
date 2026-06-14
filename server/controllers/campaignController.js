const CampaignModel = require("../models/campaignModel");
const fs = require("fs");
const path = require("path");
const { uploadToR2 } = require("../utils/r2upload");
const { deleteFromR2 } = require("../utils/r2delete");

const ALLOWED_CAMPAIGN_TYPES = [
  "poster",
  "flash_sale",
  "featured",
  "seasonal",
  "collection",
  "dashboard_poster"
];

const ALLOWED_STATUSES = ["draft", "active", "archived"];

const ALLOWED_REDIRECT_TYPES = [
  "category",
  "subcategory",
  "product",
  "brand",
  "campaign",
  "external_url",
];

const validateId = (id, fieldName = "id") => {
  if (!Number.isInteger(Number(id))) {
    const err = new Error(`Invalid ${fieldName}`);
    err.statusCode = 400;
    throw err;
  }
};

const validateRedirect = (redirect_type, redirect_id, redirect_url) => {
  if (redirect_type === "external_url" && !redirect_url) {
    const err = new Error("redirect_url is required");
    err.statusCode = 400;
    throw err;
  }

  if (redirect_type && redirect_type !== "external_url" && !redirect_id) {
    const err = new Error("redirect_id is required");
    err.statusCode = 400;
    throw err;
  }
};

class CampaignController {
  // ==========================
  // Create Campaign
  // ==========================
  async createCampaign(req, res) {
    try {
      const {
        title,
        campaign_type,
        start_at,
        end_at,
        redirect_type,
        redirect_id,
        redirect_url,
        display_order,
        status,
      } = req.body;

      if (!title?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Title is required",
        });
      }

      if (!ALLOWED_CAMPAIGN_TYPES.includes(campaign_type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid campaign type",
        });
      }

      if (status && !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
        });
      }

      if (redirect_type && !ALLOWED_REDIRECT_TYPES.includes(redirect_type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid redirect type",
        });
      }

      if (start_at && isNaN(new Date(start_at).getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid start_at",
        });
      }

      if (end_at && isNaN(new Date(end_at).getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid end_at",
        });
      }

      if (start_at && end_at && new Date(start_at) >= new Date(end_at)) {
        return res.status(400).json({
          success: false,
          message: "End date must be after start date",
        });
      }

      validateRedirect(redirect_type, redirect_id, redirect_url);

      if (display_order !== undefined && Number(display_order) < 0) {
        return res.status(400).json({
          success: false,
          message: "display_order must be 0 or greater",
        });
      }

      const campaignId = await CampaignModel.createCampaign({
        title,
        campaign_type,
        banner_image: null,
        start_at,
        end_at,
        redirect_type,
        redirect_id,
        redirect_url,
        display_order,
        status,
      });

      let banner_image = null;

      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }

          return res.status(400).json({
            success: false,
            message: "Invalid image file",
          });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        const extension = path.extname(req.file.originalname);

        const filename = `campaign-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}${extension}`;

        banner_image = `public/campaigns/${campaignId}/${filename}`;

        await uploadToR2(fileBuffer, banner_image, req.file.mimetype);

        await CampaignModel.updateCampaignImage(campaignId, banner_image);

        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }

      return res.status(201).json({
        success: true,
        campaign_id: campaignId,
        message: "Campaign created successfully",
        data: {
          banner_image,
        },
      });
    } catch (err) {
      console.error(err);

      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ==========================
  // List Campaigns
  // ==========================
  async getCampaigns(req, res) {
    try {
      const campaigns = await CampaignModel.getCampaigns(req.query);

      return res.json({
        success: true,
        count: campaigns.length,
        data: campaigns,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ==========================
  // Campaign Details
  // ==========================
  async getCampaignById(req, res) {
    try {
      validateId(req.params.id, "campaign id");

      const campaign = await CampaignModel.getCampaignById(req.params.id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      return res.json({
        success: true,
        data: campaign,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ==========================
  // Update Campaign
  // ==========================
  async updateCampaign(req, res) {
    try {
      const { id } = req.params;

      validateId(id, "campaign id");

      const { campaign_type, status, redirect_type, start_at, end_at } =
        req.body;

      if (campaign_type && !ALLOWED_CAMPAIGN_TYPES.includes(campaign_type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid campaign type",
        });
      }

      if (status && !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
        });
      }

      if (redirect_type && !ALLOWED_REDIRECT_TYPES.includes(redirect_type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid redirect type",
        });
      }

      if (start_at && isNaN(new Date(start_at).getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid start_at",
        });
      }

      if (end_at && isNaN(new Date(end_at).getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid end_at",
        });
      }

      if (start_at && end_at && new Date(start_at) >= new Date(end_at)) {
        return res.status(400).json({
          success: false,
          message: "End date must be after start date",
        });
      }

      validateRedirect(
        req.body.redirect_type,
        req.body.redirect_id,
        req.body.redirect_url,
      );

      if (
        req.body.display_order !== undefined &&
        Number(req.body.display_order) < 0
      ) {
        return res.status(400).json({
          success: false,
          message: "display_order must be 0 or greater",
        });
      }

      const existing = await CampaignModel.getCampaignById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      let bannerImage = existing.banner_image;

      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.status(400).json({
            success: false,
            message: "Invalid image file",
          });
        }

        const fileBuffer = fs.readFileSync(req.file.path);

        const extension = path.extname(req.file.originalname);

        const filename = `campaign-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}${extension}`;

        bannerImage = `public/campaigns/${id}/${filename}`;

        await uploadToR2(fileBuffer, bannerImage, req.file.mimetype);

        if (existing.banner_image) {
          try {
            await deleteFromR2(existing.banner_image);
          } catch (err) {
            console.error("OLD CAMPAIGN IMAGE DELETE ERROR", err);
          }
        }

        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }

      await CampaignModel.updateCampaign(id, req.body, bannerImage);

      return res.json({
        success: true,
        message: "Campaign updated successfully",
        data: {
          banner_image: bannerImage,
        },
      });
    } catch (err) {
      console.error("UPDATE CAMPAIGN ERROR:", err);

      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ==========================
  // Status
  // ==========================
  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
        });
      }

      validateId(id, "campaign id");

      await CampaignModel.updateStatus(id, status);

      return res.json({
        success: true,
        message: "Status updated successfully",
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ==========================
  // Delete Campaign
  // ==========================
  async deleteCampaign(req, res) {
    try {
      validateId(req.params.id, "campaign id");
      await CampaignModel.deleteCampaign(req.params.id);

      return res.json({
        success: true,
        message: "Campaign deleted successfully",
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ==========================
  // Campaign Products
  // ==========================
  async getCampaignItems(req, res) {
    try {
      validateId(req.params.id, "campaign id");

      const items = await CampaignModel.getCampaignItems(req.params.id);

      return res.json({
        success: true,
        data: items,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   Available variants
  async getAvailableVariants(req, res) {
    try {
      validateId(req.params.id, "campaign id");

      const variants = await CampaignModel.getAvailableVariants(req.params.id);

      return res.json({
        success: true,
        data: variants,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   Add items to the campaign
  async addCampaignItems(req, res) {
    try {
      const { variant_ids } = req.body;

      if (!Array.isArray(variant_ids) || variant_ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "variant_ids must be a non-empty array",
        });
      }

      validateId(req.params.id, "campaign id");

      if (!variant_ids.every((id) => Number.isInteger(Number(id)))) {
        return res.status(400).json({
          success: false,
          message: "All variant ids must be valid integers",
        });
      }

      await CampaignModel.addCampaignItems(req.params.id, variant_ids);

      return res.json({
        success: true,
        message: "Products added successfully",
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //update campaign items
  async updateCampaignItem(req, res) {
    try {
      const { id, variantId } = req.params;
      const { offer_price, max_qty } = req.body;

      validateId(id, "campaign id");
      validateId(variantId, "variant id");

      if (offer_price !== undefined && isNaN(Number(offer_price))) {
        return res.status(400).json({
          success: false,
          message: "Offer price must be numeric",
        });
      }

      if (offer_price !== undefined && Number(offer_price) < 0) {
        return res.status(400).json({
          success: false,
          message: "Offer price cannot be negative",
        });
      }

      if (max_qty !== undefined && isNaN(Number(max_qty))) {
        return res.status(400).json({
          success: false,
          message: "Max quantity must be numeric",
        });
      }

      if (max_qty !== undefined && Number(max_qty) <= 0) {
        return res.status(400).json({
          success: false,
          message: "Max quantity must be greater than 0",
        });
      }

      await CampaignModel.updateCampaignItem(
        id,
        variantId,
        offer_price,
        max_qty,
      );

      return res.json({
        success: true,
        message: "Campaign item updated",
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  //   remove campaign items
  async removeCampaignItem(req, res) {
    try {
      validateId(req.params.id, "campaign id");
      validateId(req.params.variantId, "variant id");

      await CampaignModel.removeCampaignItem(
        req.params.id,
        req.params.variantId,
      );

      return res.json({
        success: true,
        message: "Product removed",
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new CampaignController();
