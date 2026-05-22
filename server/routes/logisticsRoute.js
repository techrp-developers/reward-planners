const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const LogisticsController = require("../controllers/logisticsController");


// NDR resolution
router.post(
  "/shipments/:shipmentId/resolve-ndr",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  LogisticsController.resolveNdr,
);

// logistics dashboard
router.get(
  "/summary",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  LogisticsController.getSummary,
);


// Status breakdown
router.get(
  "/status-breakdown",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  LogisticsController.getStatusBreakdown
);

// NDR list
router.get(
  "/ndr",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  LogisticsController.getNDRList
);

// SLA metrics
router.get(
  "/sla",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  LogisticsController.getSLAMetrics
);

// Courier performance
router.get(
  "/couriers",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  LogisticsController.getCourierPerformance
);

// Recent shipment events
router.get(
  "/events",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  LogisticsController.getRecentEvents
);

module.exports = router;