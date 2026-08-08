const express = require("express");
const router = express.Router();

const locationRoute = require("./locationRoute");
const customerRoute = require("./customerRoute");
const productRoute = require("./productRoute");
const checkoutRoute = require("./checkoutRoute");
const invoiceRoute = require("./invoiceRoute");
const scheduleRoute = require("./scheduleRoute");
const companyRoute = require("./companyRoute");
const vendorRoute = require("./vendorRoute");
const poolStockRoute = require("./poolStockRoute");
const reportRoute = require("./reportRoute");
const scanRoute = require("./scanRoute");
const rewardRuleRoute = require("./rewardRuleRoute");

router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.use("/locations", locationRoute);
// customerRoute defines its own full /customers/... and /customer/... paths.
router.use("/", customerRoute);
router.use("/products", productRoute);
router.use("/checkout", checkoutRoute);
router.use("/invoices", invoiceRoute);
router.use("/schedules", scheduleRoute);
router.use("/companies", companyRoute);
router.use("/vendors", vendorRoute);
router.use("/vendor-stock", poolStockRoute);
router.use("/reports", reportRoute);
router.use("/scan", scanRoute);
router.use("/reward-rules", rewardRuleRoute);

module.exports = router;
