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
const {
  paymentLimiter,
  checkoutLimiter,
  generalLimiter,
} = require("../../../common/middlewares/rateLimiter");

// check service Availability
router.post(
  "/check-serviceability",
  auth,
  generalLimiter,
  validateServiceability,
  logisticsController.checkServiceAbility,
);

// Order Tracking
router.get(
  "/track-status/:orderId",
  auth,
  generalLimiter,
  validateGetTracking,
  logisticsController.getTracking,
);

// Shipment cancellation
router.post(
  "/shipment-cancel/:shipmentId",
  auth,
  checkoutLimiter,
  validateCancelShipment,
  logisticsController.cancelShipmentHandler,
);

module.exports = router;
