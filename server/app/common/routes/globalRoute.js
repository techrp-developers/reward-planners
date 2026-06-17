const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const GlobalController = require("../controller/globalController");
const {
  authenticateToken,
  authorizeRoles,
} = require("../../../../middleware/auth");

// Global search
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

module.exports = router;
