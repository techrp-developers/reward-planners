const express = require("express");
const router = express.Router();
const OrderController = require("../controllers/orderController");
const auth = require("../../../common/middlewares/auth");

const returnRequests = require("../../../../controllers/returnRequestController");
const multer = require("multer");
const evidenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 5 }, fileFilter: (req, file, cb) => {
  if (!["video/mp4", "video/quicktime", "video/webm"].includes(file.mimetype)) return cb(new Error("Upload an MP4, MOV or WebM video"));
  cb(null, true);
} }).single("video");
router.get("/return-requests", auth, returnRequests.customerList);
router.post("/items/:orderItemId/return-request", auth, (req, res, next) => evidenceUpload(req, res, error => {
  if (error) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ success: false, message: error.code === "LIMIT_FILE_SIZE" ? "Video must be no larger than 50 MB" : error.message });
  next();
}), returnRequests.create);

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
