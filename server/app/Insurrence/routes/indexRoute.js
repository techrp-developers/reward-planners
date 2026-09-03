const express = require("express");
const router = express.Router();

const gmcRoute = require("./gmcRoute");
const claimsRoute = require("./claimsRoute");

router.use("/", gmcRoute);
router.use("/", claimsRoute);

module.exports = router;
