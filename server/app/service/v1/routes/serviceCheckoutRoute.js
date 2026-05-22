const express = require("express");
const router = express.Router();
const ServiceCheckoutController = require("../controllers/serviceCheckoutController");
const auth = require("../../../common/middlewares/auth");

// add to checkout
router.post("/cart", auth, ServiceCheckoutController.addToCheckout);

// bundle checkout
// router.post("/bundle", auth, ServiceCheckoutController.bundleCheckout);

// buy now
router.post("/buy-now", auth, ServiceCheckoutController.buyNow);

// buy now bundle
router.post("/buy-now-bundle", auth, ServiceCheckoutController.buyNowBundle);

// get cart checkout Details
router.get("/checkout-preview", auth, ServiceCheckoutController.getCheckoutPreview);

// Get buy now checkout Details
router.get("/buy-now-preview", auth, ServiceCheckoutController.getBuyNowPreview);

// Get buy now bundle preview
router.post(
  "/buy-now-bundle-preview",
  auth,
  ServiceCheckoutController.getBuyNowBundlePreview
);


module.exports = router;
