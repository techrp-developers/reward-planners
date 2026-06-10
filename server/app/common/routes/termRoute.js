const express = require("express");
const router = express.Router();
const TermController = require("../controller/termsController");
const auth = require("../middlewares/auth");

//terms and conditions
router.get("/", TermController.getTermsAndConditions);

// privacy-policy
router.get("/privacy-policy", TermController.getPrivacyPolicy);

// current status
router.get("/current-status", auth, TermController.getTermsStatus);

// accept Term
router.post("/accept-terms", auth, TermController.updateTerms);

module.exports = router;
