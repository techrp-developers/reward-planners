const express = require("express");
const router = express.Router();
const PaymentController = require("../controllers/paymentController");

// create payment
router.post('/create-order', PaymentController.createOrder);

// verify payment
router.post('/verify-payment', PaymentController.verifyPayment);

// Payment status
router.get('/payment-status/:orderId',PaymentController.paymentStatus)

// refund
// router.post('/refund', PaymentController.refundPayment);

module.exports = router;
