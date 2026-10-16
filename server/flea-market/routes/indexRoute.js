const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../../middleware/auth");
const manager = [authenticateToken, authorizeRoles("flea_market_manager")];

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

router.use("/locations", ...manager, locationRoute);
// customerRoute defines its own full /customers/... and /customer/... paths.
router.use("/", customerRoute);
router.use("/products", ...manager, productRoute);
router.use("/checkout", ...manager, checkoutRoute);
router.use("/invoices", ...manager, invoiceRoute);
router.use("/dashboard", ...manager, require("./dashboardRoute"));
router.use("/schedules", ...manager, scheduleRoute);
router.use("/companies", ...manager, companyRoute);
router.use("/vendors", ...manager, vendorRoute);
router.use("/vendor-stock", ...manager, poolStockRoute);
router.use("/reports", ...manager, reportRoute);
router.use("/scan", ...manager, scanRoute);
router.use("/reward-rules", ...manager, rewardRuleRoute);

module.exports = router;
