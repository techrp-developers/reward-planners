const express = require("express");
const router = express.Router();
const ServiceCheckoutController = require("../controllers/serviceCheckoutController");
const auth = require("../../../common/middlewares/auth");

// get cart checkout Details
router.get(
  "/checkout-preview",
  auth,
  ServiceCheckoutController.getCheckoutPreview,
);

// add to checkout
router.post("/cart", auth, ServiceCheckoutController.addToCheckout);

// bundle checkout
// router.post("/bundle", auth, ServiceCheckoutController.bundleCheckout);

// Get buy now checkout Details
router.get(
  "/buy-now-preview",
  auth,
  ServiceCheckoutController.getBuyNowPreview,
);

// buy now
router.post("/buy-now", auth, ServiceCheckoutController.buyNow);

// Get buy now bundle preview
router.post(
  "/buy-now-bundle-preview",
  auth,
  ServiceCheckoutController.getBuyNowBundlePreview,
);

// buy now bundle
router.post("/buy-now-bundle", auth, ServiceCheckoutController.buyNowBundle);

module.exports = router;
