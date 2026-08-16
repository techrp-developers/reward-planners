const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const SupportController = require("../app/common/controller/supportController");

const guard = [authenticateToken, authorizeRoles("admin", "rm")];

// list every support ticket, across all customers
router.get("/support-tickets", ...guard, SupportController.getAllTickets);

// change a ticket's status (open / in_progress / resolved / closed)
router.put(
  "/support-tickets/:ticketId/status",
  ...guard,
  SupportController.updateTicketStatus,
);

module.exports = router;
