const express = require("express");
const router = express.Router();
const CheckoutController = require("../controllers/checkoutController");
const auth = require("../../../common/middlewares/auth");
const drainMode = require("../../../../middleware/drainMode");

// get cart checkout Details
router.get("/get-cart", auth, CheckoutController.getCheckoutCart);

// Get buy now checkout Details
router.get("/get-buy-now", auth, CheckoutController.getBuyNowCheckout);

// Place Order from Cart
router.post("/cart", auth, drainMode, CheckoutController.checkoutCart);

// place Order from Buy Now
router.post("/buy-now", auth, drainMode, CheckoutController.buyNow);

// order Receipt
router.get("/order-receipt/:orderId", auth, CheckoutController.getOrderReceipt);

module.exports = router;
