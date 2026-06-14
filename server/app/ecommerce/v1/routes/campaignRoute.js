const express = require("express");
const router = express.Router();
const CampaignController = require("../controllers/campaignController");
const drainMode = require("../../../../middleware/drainMode");

// ================================= USER ROUTES =================================

// Home screen
router.get("/home", CampaignController.getHomeCampaigns);

// Active campaigns
router.get("/list", CampaignController.getUserCampaigns);

// Campaign details
router.get("/details/:id", CampaignController.getUserCampaignById);

// Campaign products
router.get("/:id/products", CampaignController.getCampaignProducts);

module.exports = router;
