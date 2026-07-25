const express = require("express");
const router = express.Router();
const PaymentController = require("../controllers/paymentController");
const auth = require("../../../common/middlewares/auth");
const drainMode = require("../../../../middleware/drainMode");
const {
  paymentLimiter,
} = require("../../../common/middlewares/rateLimiter");

// create payment
router.post(
  "/create-order",
  auth,
  paymentLimiter,
  drainMode,
  PaymentController.createOrder,
);

// verify payment
router.post(
  "/verify-payment",
  auth,
  paymentLimiter,
  PaymentController.verifyPayment,
);

// retry Transaction
router.post("/retry", auth, paymentLimiter, PaymentController.retryTransaction);

router.post(
  "/cancel-order",
  auth,
  paymentLimiter,
  PaymentController.cancelUnpaidOrder,
);

module.exports = router;
