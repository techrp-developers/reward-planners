const express = require("express");
const router = express.Router();
const auth = require("../../../common/middlewares/auth");
const logisticsController = require("../controllers/logisticsController");

// check service Availability
router.post(
  "/check-serviceability",
  auth,
  logisticsController.checkServiceAbility,
);

// Order Tracking
router.get("/track-status/:orderId", auth, logisticsController.getTracking);

// Shipment cancellation
router.post("/shipment-cancel/:shipmentId", auth, logisticsController.cancelShipmentHandler);


module.exports = router;
