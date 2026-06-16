const express = require("express");
const router = express.Router();
const campaignController = require("../controllers/campaignController");
const { uploadFlashBanner } = require("../middleware/mediaUpload/flashUpload");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// ================================= ADMIN ROUTES =================================

// Create campaign
router.post(
  "/campaigns",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  uploadFlashBanner.single("banner_image"),
  campaignController.createCampaign,
);

// Get all campaigns
router.get(
  "/campaigns",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  campaignController.getCampaigns,
);

// Campaign details
router.get(
  "/campaigns/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  campaignController.getCampaignById,
);

// Update campaign
router.put(
  "/campaigns/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  uploadFlashBanner.single("banner_image"),
  campaignController.updateCampaign,
);

// Update status
router.patch(
  "/campaigns/:id/status",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  campaignController.updateStatus,
);

// Delete campaign
router.delete(
  "/campaigns/:id",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  campaignController.deleteCampaign,
);

// Campaign items
router.get(
  "/campaigns/:id/items",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  campaignController.getCampaignItems,
);

// Available variants
router.get(
  "/campaigns/:id/available-variants",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  campaignController.getAvailableVariants,
);

// Add items
router.post(
  "/campaigns/:id/items",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  campaignController.addCampaignItems,
);

// Update item
router.put(
  "/campaigns/:id/items/:variantId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  campaignController.updateCampaignItem,
);

// Delete item
router.delete(
  "/campaigns/:id/items/:variantId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  campaignController.removeCampaignItem,
);

module.exports = router;
