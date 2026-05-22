const express = require("express");
const router = express.Router();
const authController = require("../controller/authController");

router.post("/oauth/token", authController.generateClientToken);

module.exports = router;
