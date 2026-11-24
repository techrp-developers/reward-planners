const express = require("express");
const router = express.Router();
const CampaignController = require("../controllers/campaignController");
const optionalAuth = require("../../../common/middlewares/optionalAuth");

router.get("/home/featured", optionalAuth, CampaignController.getActiveFeaturedCampaign);
router.get("/:id/featured-products/public", optionalAuth, CampaignController.getPublicFeaturedProducts);

module.exports = router;
