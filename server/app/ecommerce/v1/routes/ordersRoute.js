const express = require("express");
const router = express.Router();
const OrderController = require("../controllers/orderController");
const auth = require("../../../common/middlewares/auth");
const returnEvidenceUpload = require("../../../../middleware/mediaUpload/returnEvidenceUpload");

// Get all orders
router.get("/orders-history", auth, OrderController.getOrderHistory);

// get order Details
router.get("/order-details/:orderId", auth, OrderController.getOrderDetails);

// Buy again
router.get("/buy-again", auth, OrderController.getBuyAgainProducts);

// Get cancellation Reason
router.get("/cancellation-reasons", OrderController.getCancellationReasons);

// Submit cancel Request
router.post("/cancel/:orderId", auth, OrderController.requestOrderCancellation);

// item cancellation request
router.post(
  "/items/:orderItemId/cancel",
  auth,
  OrderController.requestItemCancellation,
);

// Item cancellation details
router.get(
  "/items/:orderItemId/cancellation",
  auth,
  OrderController.itemCancellationDetails,
);

// =================================Return / Replacement===================================
// All return/replacement requests of the customer
router.get("/return-requests", auth, OrderController.getReturnRequests);

// Submit return/replacement request (multipart; `video` mandatory for replacement)
router.post(
  "/items/:orderItemId/return-request",
  auth,
  returnEvidenceUpload,
  OrderController.requestItemReturn,
);

// Return/replacement request details
router.get(
  "/items/:orderItemId/return-request",
  auth,
  OrderController.itemReturnDetails,
);

// Get cancellation Details
router.get(
  "/cancellation-details/:orderId",
  auth,
  OrderController.cancellationDetails,
);

// =======================================Invoice==========================================
// Get order Invoice
router.get("/invoice/:orderId", auth, OrderController.getInvoice);

module.exports = router;
