const express = require("express");
const router = express.Router();
const PaymentController = require("../controllers/paymentController");
const auth = require("../../../common/middlewares/auth");

// create payment
router.post("/create-order", auth, PaymentController.createOrder);

// verify payment
router.post("/verify-payment", auth, PaymentController.verifyPayment);

// retry Transaction
router.post("/retry", auth, PaymentController.retryTransaction);

module.exports = router;
