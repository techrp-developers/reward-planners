const express = require("express");
const router = express.Router();
const ServiceOrderController = require("../controllers/serviceOrderController");
const auth = require("../../../common/middlewares/auth");
const upload = require("../../../../middleware/mediaUpload/serviceDocumentUpload");
const supportUpload = require("../../../../middleware/mediaUpload/serviceSupportUpload");
const {
  authenticateToken,
  authorizeRoles,
} = require("../../../../middleware/auth");
const drainMode = require("../../../../middleware/drainMode");
const {
  paymentLimiter,
} = require("../../../common/middlewares/rateLimiter");

// create razorpay order
router.post(
  "/create-order",
  auth,
  paymentLimiter,
  drainMode,
  ServiceOrderController.createPaymentOrder,
);

// verify payment
router.post(
  "/verify-payment",
  auth,
  paymentLimiter,
  ServiceOrderController.verifyPayment,
);

router.get(
  "/payment-status/:parentOrderId",
  auth,
  ServiceOrderController.paymentStatus,
);

// Get all orders
router.get("/my-orders", auth, ServiceOrderController.getMyOrders);

// get order details
router.get(
  "/order-details/:parentOrderId",
  auth,
  ServiceOrderController.getOrderDetails,
);

// Get invoice
router.get(
  "/invoice-details/:parentId",
  auth,
  ServiceOrderController.getInvoiceDetails,
);

// upload order document
router.post(
  "/submit-documents/:parentOrderId",
  auth,
  upload.any(),
  ServiceOrderController.submitDocuments,
);

// Admin Order List
router.get(
  "/admin-orders",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  ServiceOrderController.adminOrderList,
);

// Admin Order Details
router.get(
  "/admin-order-details/:parentOrderId",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  ServiceOrderController.adminOrderDetails,
);

// Admin update order status
router.put(
  "/status/:id",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  ServiceOrderController.updateOrderStatus,
);

// ================================================Cancel order======================================================
// Get cancellation Reason
router.get(
  "/cancellation-reasons",
  ServiceOrderController.getCancellationReasons,
);

// request order cancellation
router.post(
  "/cancel-order-request",
  auth,
  ServiceOrderController.cancelOrderRequest,
);

// get cancellation details
router.get(
  "/cancellation-details/:serviceOrderId",
  auth,
  ServiceOrderController.cancellationDetails,
);

// ========================================Help section========================================================
// Get Issue Type
router.get("/issue-types", ServiceOrderController.getIssueTypes);

// order help
router.post(
  "/order-help",
  auth,
  supportUpload.array("files", 5),
  ServiceOrderController.createSupportRequest,
);

// Admin list for support request
router.get(
  "/order-help/:serviceOrderId",
  auth,
  ServiceOrderController.getSupportRequestsByOrderId,
);

module.exports = router;
