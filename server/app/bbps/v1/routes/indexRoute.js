const express = require("express");
const router = express.Router();
const v1PaymentRoutes = require("./paymentRoute");
const v1BillsRoutes = require("./billRoute");

router.use("/bills",v1BillsRoutes);
router.use("/bill-pay", v1PaymentRoutes);

module.exports = router;