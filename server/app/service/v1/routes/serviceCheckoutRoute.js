const express = require("express");
const router = express.Router();
const ServiceCheckoutController = require("../controllers/serviceCheckoutController");
const auth = require("../../../common/middlewares/auth");
const drainMode = require("../../../../middleware/drainMode");

// get cart checkout Details
router.get(
  "/checkout-preview",
  auth,
  ServiceCheckoutController.getCheckoutPreview,
);

// add to checkout
router.post("/cart", auth, drainMode, ServiceCheckoutController.addToCheckout);

// Get buy now checkout Details
router.get(
  "/buy-now-preview",
  auth,
  ServiceCheckoutController.getBuyNowPreview,
);

// buy now
router.post("/buy-now", auth, drainMode, ServiceCheckoutController.buyNow);

// Get buy now bundle preview
router.post(
  "/buy-now-bundle-preview",
  auth,
  ServiceCheckoutController.getBuyNowBundlePreview,
);

// buy now bundle
router.post(
  "/buy-now-bundle",
  auth,
  drainMode,
  ServiceCheckoutController.buyNowBundle,
);

module.exports = router;
