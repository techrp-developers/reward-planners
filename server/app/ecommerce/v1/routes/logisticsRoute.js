const express = require("express");
const router = express.Router();
const auth = require("../../../common/middlewares/auth");
const logisticsController = require("../controllers/logisticsController");
const {
  validateServiceability,
  validateCancelShipment,
  validateResolveNDR,
  validateGetTracking,
} = require("../middlewares/validators");

// check service Availability
router.post(
  "/check-serviceability",
  auth,
  validateServiceability,
  logisticsController.checkServiceAbility,
);

// Order Tracking
router.get(
  "/track-status/:orderId",
  auth,
  validateGetTracking,
  logisticsController.getTracking,
);

// Shipment cancellation
router.post(
  "/shipment-cancel/:shipmentId",
  auth,
  validateCancelShipment,
  logisticsController.cancelShipmentHandler,
);

module.exports = router;
