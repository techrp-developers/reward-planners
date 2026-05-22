const express = require("express");
const router = express.Router();
const ServiceController = require("../controller/serviceController");
const authenticateClient = require("../middlewares/authenticateClient");

// Feedback
router.post("/feedback", authenticateClient, ServiceController.submitFeedback);

// Enquiry
router.post("/enquiry", authenticateClient, ServiceController.createEnquiry);

// ===================================Cart===================================
// add to cart
router.post("/cart/add-item", authenticateClient, ServiceController.addToCart);

// Get cart
router.get("/cart/cart-items", authenticateClient, ServiceController.getCart);

// Remove item from cart
router.delete(
  "/cart/item/:id",
  authenticateClient,
  ServiceController.removeItem,
);

// Clear cart
router.delete(
  "/cart/clear-cart",
  authenticateClient,
  ServiceController.clearCart,
);

// =======================================checkout============================================
// add to checkout
router.post("/cart", authenticateClient, ServiceController.addToCheckout);

// buy now
router.post("/buy-now", authenticateClient, ServiceController.buyNow);

// get cart checkout Details
router.get(
  "/checkout-preview",
  authenticateClient,
  ServiceController.getCheckoutPreview,
);

// Get buy now checkout Details
router.get(
  "/buy-now-preview",
  authenticateClient,
  ServiceController.getBuyNowPreview,
);

module.exports = router;
