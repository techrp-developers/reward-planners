const express = require("express");
const router = express.Router();
const ServiceController = require("../controller/serviceController");
const authenticateClient = require("../middlewares/authenticateClient");
const upload = require("../../../middleware/mediaUpload/serviceDocumentUpload");

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

// =================================Create razor pay orders======================
// create razorpay order
router.post(
  "/create-order",
  authenticateClient,
  ServiceController.createPaymentOrder,
);

// verify payment
router.post(
  "/verify-payment",
  authenticateClient,
  ServiceController.verifyPayment,
);

// ========================================Document =============================================
// parent based document page
router.get(
  "/parent-documents/:parentOrderId",
  authenticateClient,
  ServiceController.getServiceParentOrderDocumentPage,
);

// submit document
router.post(
  "/submit-documents/:parentOrderId",
  authenticateClient,
  upload.any(),
  ServiceController.submitDocuments,
);

// ================================================Order information===========================================
// Get all orders
router.get("/my-orders", authenticateClient, ServiceController.getMyOrders);

router.get(
  "/order-details/:parentOrderId",
  authenticateClient,
  ServiceController.getOrderDetails,
);

// ======================================Feedback from user====================================================
router.post("/feedback", authenticateClient, ServiceController.submitFeedback);

// =========================================Order cancellation===========================================
router.post(
  "/cancel-order-request",
  authenticateClient,
  ServiceController.cancelOrderRequest,
);

router.get(
  "/cancellation-details/:serviceOrderId",
  authenticateClient,
  ServiceController.cancellationDetails,
);

module.exports = router;
