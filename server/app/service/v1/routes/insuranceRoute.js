const express = require("express");
const router = express.Router();
const InsuranceController = require("../controllers/insuranceController");
const auth = require("../../../common/middlewares/auth");

// create insurance
router.post("/start", auth, InsuranceController.startEnquiry);

// Save steps
router.post("/save-step", auth, InsuranceController.saveStep);

// Get Enquiry
router.get("/:id", auth, InsuranceController.getEnquiry);

// Final submission
router.post("/complete", auth, InsuranceController.completeEnquiry);

// save the plan
router.post("/select-plan", auth, InsuranceController.selectPlan);

module.exports = router;
