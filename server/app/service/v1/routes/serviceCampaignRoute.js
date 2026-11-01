const express = require("express");
const router = express.Router();
const ServiceCampaignController = require("../controllers/serviceCampaignController");

// ================================= USER ROUTES =================================

// Service home screen
router.get("/home", ServiceCampaignController.getHomeCampaigns);

// Active campaigns
router.get("/list", ServiceCampaignController.getUserCampaigns);

// Campaign details
router.get("/details/:id", ServiceCampaignController.getUserCampaignById);

// Campaign services
router.get("/:id/services", ServiceCampaignController.getCampaignServices);

module.exports = router;
