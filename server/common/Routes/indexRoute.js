const express = require("express");
const router = express.Router();
const paymentRoute = require("./paymentRoute");

// Payment
router.use("/", paymentRoute);

module.exports = router;
