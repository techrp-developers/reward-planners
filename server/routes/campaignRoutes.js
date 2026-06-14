const express = require("express");
const router = express.Router();
const campaignController = require("../controllers/campaignController");
const { uploadFlashBanner } = require("../middleware/mediaUpload/flashUpload");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// Campaign CRUD
router.post(
  "/campaigns",
  uploadFlashBanner.single("banner_image"),
  campaignController.createCampaign,
);

router.get("/campaigns", campaignController.getCampaigns);

router.get("/campaigns/:id", campaignController.getCampaignById);

router.put(
  "/campaigns/:id",
  uploadFlashBanner.single("banner_image"),
  campaignController.updateCampaign,
);

router.patch("/campaigns/:id/status", campaignController.updateStatus);

router.delete("/campaigns/:id", campaignController.deleteCampaign);

// Campaign Products
router.get("/campaigns/:id/items", campaignController.getCampaignItems);

router.get(
  "/campaigns/:id/available-variants",
  campaignController.getAvailableVariants,
);

router.post("/campaigns/:id/items", campaignController.addCampaignItems);

router.put(
  "/campaigns/:id/items/:variantId",
  campaignController.updateCampaignItem,
);

router.delete(
  "/campaigns/:id/items/:variantId",
  campaignController.removeCampaignItem,
);

module.exports = router;
