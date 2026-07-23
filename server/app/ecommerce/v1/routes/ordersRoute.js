const express = require("express");
const router = express.Router();
const OrderController = require("../controllers/orderController");
const auth = require("../../../common/middlewares/auth");

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
