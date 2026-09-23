const express = require("express");
const router = express.Router();
const claimsController = require("../controllers/claimsController");

router.post("/gmc/claims/submit", claimsController.submitEnquiry);
router.get("/gmc/claims/history", claimsController.getEnquiries);

module.exports = router;
