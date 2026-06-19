const express = require("express");
const router = express.Router();
const MaintenanceController = require("../controllers/maintenanceController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// Admin put site under maintenance
router.put(
  "/set-maintenance",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  MaintenanceController.updateMaintenanceSettings,
);

module.exports = router;
