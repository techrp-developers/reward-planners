const express = require("express");
const router = express.Router();
const PaymentController = require("../controllers/paymentController");
const drainMode = require("../../../../middleware/drainMode");
const {
  validateCreateOrder,
  validateVerifyPayment,
} = require("../middlewares/validators");
const {
  paymentLimiter,
  checkoutLimiter,
  generalLimiter,
} = require("../../../common/middlewares/rateLimiter");

// create payment
router.post(
  "/create-order",
  paymentLimiter,
  drainMode,
  validateCreateOrder,
  PaymentController.createOrder,
);

// verify payment
router.post(
  "/verify-payment",
  paymentLimiter,
  validateVerifyPayment,
  PaymentController.verifyPayment,
);

// Payment status
router.get("/payment-status/:orderId", PaymentController.paymentStatus);

// refund
// router.post('/refund', PaymentController.refundPayment);

module.exports = router;
