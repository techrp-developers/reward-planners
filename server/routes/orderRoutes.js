const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const orderController = require("../controllers/orderController");
const ecommerceOrderController = require("../app/ecommerce/v1/controllers/orderController");

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

// vendor order stats (total orders excl. cancelled + total revenue)
router.get(
  "/order-stats",
  authenticateToken,
  authorizeRoles("vendor"),
  orderController.getOrderStats,
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

// admin order cancellation requests
router.get(
  "/item-cancellation-requests",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  orderController.getItemCancellationRequests,
);

// admin item cancellation details
router.get(
  "/item-cancellation-request/:orderItemId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  orderController.getItemCancellationDetails,
);

// approve item cancellation request by admin
router.post(
  "/approve-item-cancellation/:orderItemId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  orderController.approveItemCancellation,
);

// reject item cancellation request by admin
router.post(
  "/reject-item-cancellation/:orderItemId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  orderController.rejectItemCancellation,
);

// ================================================Service======================================================
router.get(
  "/service-cancellation-requests",
  authenticateToken,
  authorizeRoles("vendor_manager", "service_manager", "admin"),
  orderController.getServiceCancellationRequests,
);

router.get(
  "/service-cancellation-request/:serviceOrderId",
  authenticateToken,
  authorizeRoles("vendor_manager", "service_manager", "admin"),
  orderController.getServiceCancellationDetails,
);

// approve cancellation request
router.post(
  "/approve-service-cancellation/:serviceOrderId",
  authenticateToken,
  authorizeRoles("vendor_manager", "service_manager", "admin"),
  orderController.approveServiceCancellation,
);

router.get(
  "/invoice/:orderId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  ecommerceOrderController.getInvoiceForManager,
);

router.post(
  "/cancel-service/:serviceOrderId",
  authenticateToken,
  authorizeRoles("vendor_manager", "service_manager", "admin"),
  orderController.cancelServiceAsManager,
);

// reject service cancellation
router.post(
  "/reject-service-cancellation/:serviceOrderId",
  authenticateToken,
  authorizeRoles("vendor_manager", "service_manager", "admin"),
  orderController.rejectServiceCancellation,
);

// ====================================================MPS service=================================================
// approve cancellation request
router.post(
  "/approve-mps-service-cancellation/:serviceOrderId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  orderController.approveMpsServiceCancellation,
);

// reject service cancellation
router.post(
  "/reject-mps-service-cancellation/:serviceOrderId",
  authenticateToken,
  authorizeRoles("vendor_manager", "admin"),
  orderController.rejectMpsServiceCancellation,
);

module.exports = router;
