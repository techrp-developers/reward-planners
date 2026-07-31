const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const invoiceController = require("../controllers/invoiceController");

router.get("/filter-options", reportController.filterOptions);
router.get("/vendor-sales", reportController.vendorSales);
router.get("/vendor-points-redeemed", reportController.vendorPointsRedeemed);
router.get("/vendor-sales-summary", reportController.vendorSalesSummary);
router.get("/purchase-history/filter-options", reportController.purchaseHistoryFilterOptions);
router.get("/purchase-history", reportController.purchaseHistory);
// Manager-facing invoice detail (no customer OTP session in this context —
// see invoiceController.getByIdForReports).
router.get("/invoices/:invoiceId", invoiceController.getByIdForReports);

module.exports = router;
