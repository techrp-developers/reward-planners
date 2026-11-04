const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../../middleware/auth");
const manager = [authenticateToken, authorizeRoles("flea_market_manager")];
const customerController = require("../controllers/customerController");
const { validateSendOtp, validateVerifyOtp, validateSelectCustomer, validateReverify } = require("../middlewares/validators");

// Note the plural/singular split matches the spec exactly: /customers/search (search a list)
// vs /customer/send-otp etc. (act on a single customer).
router.get("/customers/search", ...manager, customerController.search);
router.post("/customer/select", ...manager, validateSelectCustomer, customerController.selectCustomer);
router.post("/customer/send-otp", ...manager, validateSendOtp, customerController.sendOtp);
router.post("/customer/verify-otp", ...manager, validateVerifyOtp, customerController.verifyOtp);
router.post("/customer/reverify", ...manager, validateReverify, customerController.reverify);

module.exports = router;
