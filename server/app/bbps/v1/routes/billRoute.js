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

// Search operators across ALL categories
router.get(
  "/operators/search",
  providerReadLimiter,
  BillController.searchOperators,
);

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

// Operator search history
router.post("/search-history", auth, BillController.saveSearchHistory);
router.get("/search-history", auth, BillController.getSearchHistory);
router.delete("/search-history", auth, BillController.clearSearchHistory);

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

// Order history
router.get(
  "/order-history",
  auth,
  generalLimiter,
  BillController.getOrderHistory,
);

module.exports = router;
