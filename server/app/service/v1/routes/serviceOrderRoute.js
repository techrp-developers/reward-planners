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

// Direct Order
router.post("/direct", auth, ServiceOrderController.createDirectOrder);

// Enquiry Order
router.post(
  "/from-enquiry/:enquiryId",
  auth,
  ServiceOrderController.createEnquiryOrder,
);

// create razorpay order
router.post(
  "/create-order",
  auth,
  ServiceOrderController.createPaymentOrder,
);

// verify payment
router.post(
  "/verify-payment",
  auth,
  ServiceOrderController.verifyPayment,
);

// Get all orders
router.get(
  "/my-orders",
   auth,
  ServiceOrderController.getMyOrders,
);

// get order details
// router.get(
//   "/order-details/:id",
//   //  auth,
//   ServiceOrderController.getOrderDetails,
// );

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
  "/upload-document/:orderId",
  auth,
  upload.single("file"),
  ServiceOrderController.uploadDocument,
);

// submit document
router.post(
  "/submit-documents/:orderId",
  auth,
  ServiceOrderController.submitDocuments,
);

// update order status from admin side
router.put(
  "/status/:id",
  authenticateToken,
  authorizeRoles("admin", "vendor_manager"),
  ServiceOrderController.updateOrderStatus,
);

// ================================================Cancel order======================================================
router.post("/cancel-order", auth, ServiceOrderController.cancelOrder);

// ========================================Help section========================================================
router.post(
  "/order-help",
  auth,
  supportUpload.array("files", 5),
  ServiceOrderController.createSupportRequest,
);

// support request list for admin
router.get(
  "/order-help/:parentId",
  auth,
  ServiceOrderController.getSupportRequestsByOrderId,
);

module.exports = router;
