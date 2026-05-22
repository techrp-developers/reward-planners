const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const orderController = require("../controllers/orderController");

// Get all orders
router.get(
  "/order-list",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  orderController.getOrderList,
);

// Get order details by order ID
router.get(
  "/order-details/:orderId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  orderController.getAdminOrderDetails,
);

// ===================================Order details for vendor======================================================
// get order list of a vendor
router.get(
  "/order-summary",
  authenticateToken,
  authorizeRoles("vendor"),
  orderController.getOrderSummary,
);

// view orders
router.get(
  "/order-view/:vendorOrderId",
  authenticateToken,
  authorizeRoles("vendor"),
  orderController.viewVendorOrderDetails,
);

// ===================================Admin order cancellation========================================
// all cancellation requests
router.get(
  "/cancellation-requests",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  orderController.getCancellationRequests,
);

//  cancelled order details
router.get(
  "/cancellation-request/:orderId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  orderController.getCancellationRequestDetails,
);

// approve cancellation request
router.post(
  "/approve-cancellation/:orderId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  orderController.approveCancellation,
);

// reject cancellation request
router.post(
  "/reject-cancellation/:orderId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  orderController.rejectCancellation,
);

module.exports = router;
