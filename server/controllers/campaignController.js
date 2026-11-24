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
  "service",
  "service_category",
  "service_bundle",
];

const ALLOWED_MODULES = ["product", "service"];
const FEATURED_BACKGROUND_TYPES = ["solid", "gradient", "image"];
const FEATURED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PRODUCT_REDIRECT_TYPES = ["category", "subcategory", "product", "brand"];
const SERVICE_REDIRECT_TYPES = ["service", "service_category", "service_bundle"];
const MULTI_TARGET_REDIRECT_TYPES = ["product", "service"];
const VALIDATED_REDIRECT_TYPES = [
  "product",
  "category",
  "subcategory",
  ...SERVICE_REDIRECT_TYPES,
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

const badRequest = (message) => {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
};

const validateFeaturedConfiguration = (data, existing = {}, hasNewImage = false) => {
  const title = data.title ?? existing.title;
  const backgroundType = data.background_type ?? existing.background_type ?? "gradient";
  const backgroundColor = data.background_color ?? existing.background_color ?? "#4B0082";
  const gradientEndColor = data.gradient_end_color ?? existing.gradient_end_color ?? "#6A00FF";
  const textColor = data.text_color ?? existing.text_color ?? "#FFFFFF";
  const ctaText = data.cta_text ?? existing.cta_text ?? "Explore More";
  const bannerImage = hasNewImage ? true : existing.banner_image_path || existing.banner_image;

  if (typeof title !== "string" || !title.trim() || title.trim().length > 255) {
    throw badRequest("Featured campaign title must be between 1 and 255 characters");
  }
  if (!FEATURED_BACKGROUND_TYPES.includes(backgroundType)) {
    throw badRequest("background_type must be solid, gradient, or image");
  }
  for (const [label, value] of [
    ["background_color", backgroundColor],
    ["gradient_end_color", gradientEndColor],
    ["text_color", textColor],
  ]) {
    if (typeof value !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
      throw badRequest(`${label} must be a six-digit hex color`);
    }
  }
  if (typeof ctaText !== "string" || !ctaText.trim() || ctaText.length > 60) {
    throw badRequest("cta_text must be between 1 and 60 characters");
  }
  if (backgroundType === "image" && !bannerImage) {
    throw badRequest("Upload a background image before using image background type");
  }
};

const uploadCampaignImage = async (file, campaignId, featured) => {
  if (featured && !FEATURED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    throw badRequest("Featured backgrounds must be JPG, PNG, or WebP images");
  }

  const crypto = require("crypto");
  let buffer = fs.readFileSync(file.path);
  let extension = path.extname(file.originalname).toLowerCase();
  let contentType = file.mimetype;
  if (featured) {
    try {
      buffer = await require("sharp")(buffer, { limitInputPixels: 25000000 })
        .rotate()
        .resize({ width: 2000, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw badRequest("This background image could not be read");
    }
    extension = ".webp";
    contentType = "image/webp";
  }
  const key = `public/campaigns/${campaignId}/${featured ? "featured" : "campaign"}-${crypto.randomUUID()}${extension}`;
  await uploadToR2(buffer, key, contentType);
  return key;
};

const parseRedirectIds = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw badRequest("redirect_ids must be a list of ids");
  }
};

// One poster can open several products or services; the first also fills
// redirect_id, so every other destination keeps a single target.
const resolveRedirectIds = (redirectType, redirectId, redirectIds) => {
  if (!MULTI_TARGET_REDIRECT_TYPES.includes(redirectType)) return { redirectId, redirectIds: null };
  const ids = [...new Set(parseRedirectIds(redirectIds).map(Number))];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw badRequest("redirect_ids must contain only positive ids");
  }
  if (!ids.length) return { redirectId, redirectIds: redirectId ? JSON.stringify([redirectId]) : null };
  return { redirectId: ids[0], redirectIds: JSON.stringify(ids) };
};

const validateRedirectModule = (campaignType, module, redirectType) => {
  if (campaignType !== "poster" || !redirectType) return;
  if (module === "service" && PRODUCT_REDIRECT_TYPES.includes(redirectType)) {
    throw badRequest("A service poster must open a service destination");
  }
  if (module !== "service" && SERVICE_REDIRECT_TYPES.includes(redirectType)) {
    throw badRequest("An ecommerce poster must open an ecommerce destination");
  }
};

const redirectTargetsExist = async (redirectType, redirectId, redirectIds) => {
  if (!VALIDATED_REDIRECT_TYPES.includes(redirectType)) return;
  const ids = redirectIds ? JSON.parse(redirectIds) : [redirectId];
  for (const id of ids) {
    if (!(await CampaignModel.redirectTargetExists(redirectType, id))) {
      throw badRequest(`Selected ${redirectType.replaceAll("_", " ")} no longer exists`);
    }
  }
};

// The main dashboard spans every module, so a dashboard poster's module simply
// follows its destination; other campaigns keep the module they were created in.
const campaignModule = (campaignType, module, redirectType) =>
  campaignType === "dashboard_poster"
    ? (SERVICE_REDIRECT_TYPES.includes(redirectType) ? "service" : "product")
    : (module || "product");

class CampaignController {
  async getRedirectTargets(req, res) {
    try {
      const data = await CampaignModel.getRedirectTargets(req.query.type, req.query.search, req.query.selected_id);
      return res.json({ success: true, data });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
  // ==========================
  // Create Campaign
  // ==========================
  async createCampaign(req, res) {
    let uploadedBannerPath = null;
    try {
      const {
        title,
        campaign_type,
        module,
        start_at,
        end_at,
        redirect_type,
        redirect_id,
        redirect_ids,
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

      if (module && !ALLOWED_MODULES.includes(module)) {
        return res.status(400).json({
          success: false,
          message: "Invalid module",
        });
      }

      if (campaign_type === "featured" && module && module !== "product") {
        return res.status(400).json({
          success: false,
          message: "Featured campaigns are only available for products",
        });
      }
      if (campaign_type === "featured" && status === "active") {
        return res.status(400).json({
          success: false,
          message: "Create the featured campaign as a draft, add products, then activate it",
        });
      }

      if (campaign_type === "flash_sale" && (!start_at || !end_at)) {
        return res.status(400).json({
          success: false,
          message: "A flash sale needs a start and end time",
        });
      }

      if (campaign_type === "featured") {
        validateFeaturedConfiguration(req.body, {}, Boolean(req.file));
        if (req.file && !FEATURED_IMAGE_MIME_TYPES.includes(req.file.mimetype)) {
          throw badRequest("Featured backgrounds must be JPG, PNG, or WebP images");
        }
      }

      if (["poster", "dashboard_poster"].includes(campaign_type) && !req.file) {
        return res.status(400).json({
          success: false,
          message: "A poster needs an image",
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

      const redirectIdNumber = Number(redirect_id);
      const hasNumericRedirectId =
        Number.isInteger(redirectIdNumber) && redirectIdNumber > 0;
      const hasNoRedirectLabel =
        String(redirect_id || "").trim().toLowerCase() === "no redirect";
      const normalizedRedirectType = hasNoRedirectLabel
        ? null
        : redirect_type || null;
      const { redirectId: normalizedRedirectId, redirectIds: normalizedRedirectIds } = resolveRedirectIds(
        normalizedRedirectType,
        normalizedRedirectType && normalizedRedirectType !== "external_url" && hasNumericRedirectId
          ? redirectIdNumber
          : null,
        redirect_ids,
      );
      const normalizedRedirectUrl =
        normalizedRedirectType === "external_url" ? redirect_url : null;

      validateRedirect(
        normalizedRedirectType,
        normalizedRedirectId,
        normalizedRedirectUrl,
      );

      validateRedirectModule(campaign_type, module, normalizedRedirectType);
      await redirectTargetsExist(normalizedRedirectType, normalizedRedirectId, normalizedRedirectIds);

      if (
        display_order !== undefined &&
        (!/^\d+$/.test(String(display_order)) || !Number.isSafeInteger(Number(display_order)))
      ) {
        return res.status(400).json({
          success: false,
          message: "display_order must be a non-negative whole number",
        });
      }

      const campaignId = await CampaignModel.createCampaign({
        title,
        campaign_type,
        module: campaignModule(campaign_type, module, normalizedRedirectType),
        banner_image: null,
        start_at,
        end_at,
        redirect_type: normalizedRedirectType,
        redirect_id: normalizedRedirectId,
        redirect_ids: normalizedRedirectIds,
        redirect_url: normalizedRedirectUrl,
        display_order,
        status,
      });

      let banner_image = null;

      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          throw badRequest("Invalid image file");
        }
        banner_image = await uploadCampaignImage(
          req.file,
          campaignId,
          campaign_type === "featured",
        );
        uploadedBannerPath = banner_image;

        await CampaignModel.updateCampaignImage(campaignId, banner_image);
      }

      uploadedBannerPath = null;
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

      if (uploadedBannerPath) {
        try {
          await deleteFromR2(uploadedBannerPath);
        } catch (cleanupError) {
          console.error("NEW CAMPAIGN IMAGE CLEANUP ERROR", cleanupError);
        }
      }
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error("CAMPAIGN TEMP IMAGE CLEANUP ERROR", cleanupError);
        }
      }
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
    let uploadedBannerPath = null;
    let previousBannerPath = null;
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

      if (req.body.module && !ALLOWED_MODULES.includes(req.body.module)) {
        return res.status(400).json({
          success: false,
          message: "Invalid module",
        });
      }

      const existing = await CampaignModel.getCampaignById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      // Items live in a module-specific table, so a flash sale cannot change kind.
      const nextType = campaign_type || existing.campaign_type;
      if (
        (existing.campaign_type === "flash_sale" || nextType === "flash_sale") &&
        nextType !== existing.campaign_type
      ) {
        throw badRequest("A flash sale cannot be converted to another campaign type");
      }
      if (existing.campaign_type === "flash_sale") delete req.body.module;
      if (nextType === "featured" && (req.body.module || existing.module) !== "product") {
        throw badRequest("Featured campaigns are only available for products");
      }
      if (nextType === "featured") {
        validateFeaturedConfiguration(req.body, existing, Boolean(req.file));
      }

      // Omitted destination fields leave the saved destination untouched.
      if (req.body.redirect_type !== undefined) {
        const normalizedRedirectType = req.body.redirect_type || null;
        const { redirectId: normalizedRedirectId, redirectIds: normalizedRedirectIds } = resolveRedirectIds(
          normalizedRedirectType,
          normalizedRedirectType && normalizedRedirectType !== "external_url" ? Number(req.body.redirect_id) || null : null,
          req.body.redirect_ids,
        );
        const normalizedRedirectUrl = normalizedRedirectType === "external_url" ? req.body.redirect_url || null : null;
        validateRedirect(normalizedRedirectType, normalizedRedirectId, normalizedRedirectUrl);
        validateRedirectModule(nextType, req.body.module || existing.module, normalizedRedirectType);
        await redirectTargetsExist(normalizedRedirectType, normalizedRedirectId, normalizedRedirectIds);
        req.body.redirect_type = normalizedRedirectType;
        req.body.redirect_id = normalizedRedirectId;
        req.body.redirect_ids = normalizedRedirectIds;
        req.body.redirect_url = normalizedRedirectUrl;
        if (nextType === "dashboard_poster") {
          req.body.module = campaignModule(nextType, null, normalizedRedirectType);
        }
      }

      if (
        req.body.display_order !== undefined &&
        (!/^\d+$/.test(String(req.body.display_order)) ||
          !Number.isSafeInteger(Number(req.body.display_order)))
      ) {
        return res.status(400).json({
          success: false,
          message: "display_order must be a non-negative whole number",
        });
      }

      // Stays null without a new upload: the model only writes a new image.
      let bannerImage = null;

      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          throw badRequest("Invalid image file");
        }
        bannerImage = await uploadCampaignImage(
          req.file,
          id,
          nextType === "featured",
        );
        uploadedBannerPath = bannerImage;
        previousBannerPath = existing.banner_image_path;
      }

      await CampaignModel.updateCampaign(id, req.body, bannerImage);
      uploadedBannerPath = null;
      if (previousBannerPath) {
        try {
          await deleteFromR2(previousBannerPath);
        } catch (err) {
          console.error("OLD CAMPAIGN IMAGE DELETE ERROR", err);
        }
      }
      return res.json({
        success: true,
        message: "Campaign updated successfully",
        data: {
          banner_image: bannerImage || existing.banner_image_path,
        },
      });
    } catch (err) {
      console.error("UPDATE CAMPAIGN ERROR:", err);

      if (uploadedBannerPath) {
        try {
          await deleteFromR2(uploadedBannerPath);
        } catch (cleanupError) {
          console.error("NEW CAMPAIGN IMAGE CLEANUP ERROR", cleanupError);
        }
      }
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error("CAMPAIGN TEMP IMAGE CLEANUP ERROR", cleanupError);
        }
      }
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

  async searchFeaturedProductOptions(req, res) {
    try {
      const data = await CampaignModel.getFeaturedProductOptions(req.query.search || "");
      return res.json({ success: true, data });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getFeaturedProducts(req, res) {
    try {
      validateId(req.params.id, "campaign id");
      const campaign = await CampaignModel.getCampaignById(req.params.id);
      if (!campaign) {
        return res.status(404).json({ success: false, message: "Campaign not found" });
      }
      if (campaign.campaign_type !== "featured" || campaign.module !== "product") {
        return res.status(400).json({ success: false, message: "This is not a product featured campaign" });
      }
      const data = await CampaignModel.getFeaturedProducts(req.params.id);
      return res.json({ success: true, data });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async saveFeaturedProducts(req, res) {
    try {
      validateId(req.params.id, "campaign id");
      const data = await CampaignModel.saveFeaturedProducts(
        req.params.id,
        req.body.product_ids,
      );
      return res.json({
        success: true,
        message: "Featured product order saved",
        data,
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

  // Add a category, subcategory, or product selection at a shared discount
  async bulkAddCampaignItems(req, res) {
    try {
      validateId(req.params.id, "campaign id");

      const result = await CampaignModel.bulkAddCampaignItems(req.params.id, req.body);

      return res.json({
        success: true,
        message: result.added ? `${result.added} items added` : "No new eligible items found",
        data: result,
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
