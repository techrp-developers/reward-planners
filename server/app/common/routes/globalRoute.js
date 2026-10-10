const express = require("express");
const router = express.Router();
const GlobalController = require("../controller/globalController");
const communityInvitation = require("../controller/communityInvitationController");
const {
  authenticateToken,
  authorizeRoles,
} = require("../../../middleware/auth");

// Global search
router.post("/community-invitation",communityInvitation.english);
  
router.post("/community-invitation-marathi",communityInvitation.marathi);

router.get("/search/suggestions", GlobalController.getGlobalSuggestions);

// Get maintenance status
router.get("/app-status", GlobalController.getAppStatus);

// Update wallet coins
router.post(
  "/credit-wallet",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  GlobalController.creditWallet,
);

// campaign launch event
router.post(
  "/campaigns/launch-event",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  GlobalController.sendLaunchCampaign,
);

// IOS available
router.post(
  "/campaign-ios-update",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  GlobalController.iosUpdateCampaign,
);

// Flea Market Inamdar event
router.post(
  "/campaign-flea-market-inamdar",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  GlobalController.fleaMarketInamdarCampaign,
);

module.exports = router;
