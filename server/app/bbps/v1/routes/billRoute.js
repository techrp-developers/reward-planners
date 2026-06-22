const express = require("express");
const router = express.Router();
const BillController = require("../controllers/billController");
const auth = require("../../../common/middlewares/auth");
const fetchBillValidation = require("../middlewares/fetchBillValidation");
const fetchBillRateLimit = require("../middlewares/fetchBillRateLimit");
const {
  providerReadLimiter,
  generalLimiter,
} = require("../../../common/middlewares/rateLimiter");

// Categories
router.get("/categories", providerReadLimiter, BillController.getCategories);

// BBPS operator locations / telecom circles
router.get("/locations", providerReadLimiter, BillController.getLocations);

// Operators
router.get("/operators", providerReadLimiter, BillController.getOperators);

// Grouped operators
router.get(
  "/operators-grouped",
  providerReadLimiter,
  BillController.getGroupedOperators,
);

// Operator details
router.get(
  "/operator/:id",
  providerReadLimiter,
  BillController.getOperatorDetails,
);

router.get(
  "/recharge/plans",
  auth,
  providerReadLimiter,
  BillController.getRechargePlans,
);

// fetch bill readiness
router.get(
  "/fetch-bill-check",
  auth,
  providerReadLimiter,
  BillController.getFetchBillReadiness,
);

// check consumer number and fetch bill details for UI
router.post(
  "/check-customer-number",
  auth,
  fetchBillRateLimit,
  fetchBillValidation,
  BillController.checkCustomerNumber,
);

// fetch bill details
router.post(
  "/fetch-bill",
  auth,
  fetchBillRateLimit,
  fetchBillValidation,
  BillController.fetchBill,
);

router.get(
  "/check-status/:transaction_id",
  auth,
  generalLimiter,
  BillController.checkStatus,
);

module.exports = router;
