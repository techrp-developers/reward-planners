const express = require("express");

const busBookingRoutes = require("./busRoutes");

const router = express.Router();

router.use("/", busBookingRoutes);

module.exports = router;
;
