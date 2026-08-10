const express = require("express");
const router = express.Router();
const SupportController = require("../controller/supportController");
const auth = require("../middlewares/auth");
const supportUpload = require("../../../middleware/mediaUpload/serviceSupportUpload");

// get categories
router.get("/categories", SupportController.getCategories);

// create a new support ticket
router.post(
  "/create-ticket",
  auth,
  supportUpload.array("files", 5),
  SupportController.createTicket,
);

// get all tickets for logged in user
router.get("/my-tickets", auth, SupportController.getMyTickets);

// get latest ecommerce and service orders for logged in user
router.get("/recent-orders", auth, SupportController.getRecentOrders);

module.exports = router;
