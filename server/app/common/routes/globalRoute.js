const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const GlobalController = require("../controller/globalController");

// Global search
router.get("/search/suggestions", GlobalController.getGlobalSuggestions);

// Get maintenance status
router.get("/app-status", GlobalController.getAppStatus);

module.exports = router;
