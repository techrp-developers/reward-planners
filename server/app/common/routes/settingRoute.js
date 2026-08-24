const express = require("express");
const router = express.Router();
const SettingController = require("../controller/settingController");
const { authenticateToken, authorizeRoles } = require("../../../middleware/auth");

// All settings
router.get("/app-settings", SettingController.getAppSettings);

// Update application versions, force-update flags, maintenance settings,
// and company details. Partial payloads are supported.
router.patch(
  "/app-settings",
  // authenticateToken,
  // authorizeRoles("vendor_manager","admin"),
  SettingController.updateAppSettings,
);
router.put(
  "/app-settings",
  // authenticateToken,
  // authorizeRoles("vendor_manager","admin"),
  SettingController.updateAppSettings,
);

// Company Details
router.get("/company-details", SettingController.getCompanyDetails);

module.exports = router;