const express = require("express");
const router = express.Router();
const PaymentController = require("../controllers/paymentController");
const auth = require("../../../common/middlewares/auth");
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
  auth,
  paymentLimiter,
  drainMode,
  validateCreateOrder,
  PaymentController.createOrder,
);

// verify payment
router.post(
  "/verify-payment",
  auth,
  paymentLimiter,
  validateVerifyPayment,
  PaymentController.verifyPayment,
);

// Payment status
router.get("/payment-status/:orderId", auth, PaymentController.paymentStatus);

// Release an unpaid order after the customer explicitly cancels/fails checkout.
router.post(
  "/cancel-order/:orderId",
  auth,
  paymentLimiter,
  PaymentController.cancelPendingOrder,
);

// refund
// router.post('/refund', PaymentController.refundPayment);

module.exports = router;
