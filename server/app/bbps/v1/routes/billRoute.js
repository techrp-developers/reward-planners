const express = require("express");
const router = express.Router();
const BillController = require("../controllers/billController");
const auth = require("../../../common/middlewares/auth");
const fetchBillValidation = require("../middlewares/fetchBillValidation");
const fetchBillRateLimit = require("../middlewares/fetchBillRateLimit");

// Categories
router.get("/categories", BillController.getCategories);

// Operators
router.get("/operators", BillController.getOperators);

// Grouped operators
router.get("/operators-grouped", BillController.getGroupedOperators);

// Operator details
router.get("/operator/:id", BillController.getOperatorDetails);

// fetch bill readiness
router.get(
  "/fetch-bill-check",
  // auth,
  BillController.getFetchBillReadiness,
);

// check consumer number and fetch bill details for UI
router.post(
  "/check-customer-number",
  // auth,
  fetchBillRateLimit,
  fetchBillValidation,
  BillController.checkCustomerNumber,
);

// fetch bill details
router.post(
  "/fetch-bill",
  // auth,
  fetchBillRateLimit,
  fetchBillValidation,
  BillController.fetchBill,
);

router.get(
  "/check-status/:transaction_id",
  // auth,
  BillController.checkStatus,
);

module.exports = router;
