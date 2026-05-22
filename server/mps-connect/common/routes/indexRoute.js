const express = require("express");
const router = express.Router();
const authRoutes = require("./authRoute");
const serviceRoute = require("./serviceRoute");
const insuranceRoute = require("./insuranceRoute");

router.use("/auth", authRoutes);
router.use("/service", serviceRoute);
router.use("/insurance",insuranceRoute)


module.exports = router;
