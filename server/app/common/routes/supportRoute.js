const express = require("express");
const router = express.Router();
const SupportController = require("../controller/supportController");
const auth = require("../middlewares/auth");

// get categories
router.get("/categories", SupportController.getCategories);

// create a new support ticket
router.post("/create-ticket", auth, SupportController.createTicket);

// get all tickets for logged in user
router.get("/my-tickets", auth, SupportController.getMyTickets);

module.exports = router;