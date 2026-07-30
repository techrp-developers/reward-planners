const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customerController");
const { validateSendOtp, validateVerifyOtp, validateSelectCustomer, validateReverify } = require("../middlewares/validators");

// Note the plural/singular split matches the spec exactly: /customers/search (search a list)
// vs /customer/send-otp etc. (act on a single customer).
router.get("/customers/search", customerController.search);
router.post("/customer/select", validateSelectCustomer, customerController.selectCustomer);
router.post("/customer/send-otp", validateSendOtp, customerController.sendOtp);
router.post("/customer/verify-otp", validateVerifyOtp, customerController.verifyOtp);
router.post("/customer/reverify", validateReverify, customerController.reverify);

module.exports = router;
