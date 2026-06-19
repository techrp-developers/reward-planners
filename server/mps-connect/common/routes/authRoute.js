const express = require("express");
const router = express.Router();
const authController = require("../controller/authController");
const authenticateClient = require("../middlewares/authenticateClient");

// create token
router.post("/oauth/token", authController.generateClientToken);

// create support ticket
router.post(
  "/create-ticket",
  authenticateClient,
  authController.createTicket,
);

module.exports = router;
