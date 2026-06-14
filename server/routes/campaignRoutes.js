const express = require("express");
const router = express.Router();
const campaignController = require("../controllers/campaignController");
const { uploadFlashBanner } = require("../middleware/mediaUpload/flashUpload");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// ================================= USER ROUTES =================================

// Home screen
router.get("/home", campaignController.getHomeCampaigns);

// Active campaigns
router.get("/list", campaignController.getUserCampaigns);

// Campaign details
router.get("/details/:id", campaignController.getUserCampaignById);

// Campaign products
router.get("/:id/products", campaignController.getCampaignProducts);

// ================================= ADMIN ROUTES =================================

// Create campaign
router.post(
  "/campaigns",
  uploadFlashBanner.single("banner_image"),
  campaignController.createCampaign,
);

// Get all campaigns
router.get("/campaigns", campaignController.getCampaigns);

// Campaign details
router.get("/campaigns/:id", campaignController.getCampaignById);

// Update campaign
router.put(
  "/campaigns/:id",
  uploadFlashBanner.single("banner_image"),
  campaignController.updateCampaign,
);

// Update status
router.patch("/campaigns/:id/status", campaignController.updateStatus);

// Delete campaign
router.delete("/campaigns/:id", campaignController.deleteCampaign);

// Campaign items
router.get("/campaigns/:id/items", campaignController.getCampaignItems);

// Available variants
router.get(
  "/campaigns/:id/available-variants",
  campaignController.getAvailableVariants,
);

// Add items
router.post("/campaigns/:id/items", campaignController.addCampaignItems);

// Update item
router.put(
  "/campaigns/:id/items/:variantId",
  campaignController.updateCampaignItem,
);

// Delete item
router.delete(
  "/campaigns/:id/items/:variantId",
  campaignController.removeCampaignItem,
);

module.exports = router;
