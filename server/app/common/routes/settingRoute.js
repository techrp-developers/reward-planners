const express = require("express");
const router = express.Router();
const SettingController = require("../controller/settingController");

// All settings
router.get("/app-settings", SettingController.getAppSettings);

// Company Details
router.get("/company-details", SettingController.getCompanyDetails);

module.exports = router;