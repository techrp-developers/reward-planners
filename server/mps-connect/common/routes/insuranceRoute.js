const express = require("express");
const router = express.Router();
const InsuranceController = require("../controller/insuranceController");
const authenticateClient = require("../middlewares/authenticateClient");

// create insurance
router.post("/start", authenticateClient, InsuranceController.startEnquiry);

// Save steps
router.post("/save-step", authenticateClient, InsuranceController.saveStep);

// Get Enquiry
router.get("/:id", authenticateClient, InsuranceController.getEnquiry);

// Final submission
router.post("/complete", authenticateClient, InsuranceController.completeEnquiry);

// save the plan
router.post("/select-plan", authenticateClient, InsuranceController.selectPlan);

module.exports = router;
