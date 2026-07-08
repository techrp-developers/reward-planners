const express = require("express");
const router = express.Router();
const CampaignController = require("../controllers/campaignController");
const drainMode = require("../../../../middleware/drainMode");
const optionalAuth = require("../../../common/middlewares/optionalAuth");

// ================================= USER ROUTES =================================

// Home screen
router.get("/home", CampaignController.getHomeCampaigns);

// Active campaigns
router.get("/list", CampaignController.getUserCampaigns);

// Campaign details
router.get("/details/:id", CampaignController.getUserCampaignById);

// Campaign products
router.get("/:id/products", optionalAuth, CampaignController.getCampaignProducts);

module.exports = router;
