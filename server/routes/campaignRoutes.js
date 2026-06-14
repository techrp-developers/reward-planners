const express = require("express");
const router = express.Router();
const campaignController = require("../controllers/campaignController");
const { uploadFlashBanner } = require("../middleware/mediaUpload/flashUpload");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// =================================Admin Routes============================================

// create campaign
router.post(
  "/campaigns",
  uploadFlashBanner.single("banner_image"),
  campaignController.createCampaign,
);

// Get all campaigns
router.get("/campaigns", campaignController.getCampaigns);

// Campaign by Id
router.get("/campaigns/:id", campaignController.getCampaignById);

// Update a campaign
router.put(
  "/campaigns/:id",
  uploadFlashBanner.single("banner_image"),
  campaignController.updateCampaign,
);

// update campaign status
router.patch("/campaigns/:id/status", campaignController.updateStatus);

// Delete a campaign
router.delete("/campaigns/:id", campaignController.deleteCampaign);

// Campaign Products
router.get("/campaigns/:id/items", campaignController.getCampaignItems);

// get available variants
router.get(
  "/campaigns/:id/available-variants",
  campaignController.getAvailableVariants,
);

// add items to campaign
router.post("/campaigns/:id/items", campaignController.addCampaignItems);

// update campaign items
router.put(
  "/campaigns/:id/items/:variantId",
  campaignController.updateCampaignItem,
);

// delete campaign items
router.delete(
  "/campaigns/:id/items/:variantId",
  campaignController.removeCampaignItem,
);

// ===========================================user Routes======================================
// Home screen
router.get("/campaigns/home", campaignController.getHomeCampaigns);

// Active campaigns list
router.get("/campaigns", campaignController.getCampaigns);

// Campaign details
router.get("/campaigns/:id", campaignController.getCampaignById);

// Campaign products
router.get("/campaigns/:id/products", campaignController.getCampaignProducts);

module.exports = router;
