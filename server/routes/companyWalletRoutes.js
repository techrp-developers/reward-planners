const express = require("express");
const controller = require("../controllers/companyWalletController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

const router = express.Router();
const walletGuard = [authenticateToken, authorizeRoles("hr", "admin")];
const adminGuard = [authenticateToken, authorizeRoles("admin")];

// Summary of the company wallet
router.get("/", ...walletGuard, controller.summary.bind(controller));

// Get the transactions of the company wallet
router.get("/transactions", ...walletGuard, controller.transactions.bind(controller));

// Award points to an employee
router.post("/award", ...walletGuard, controller.award.bind(controller));

// Fund the company wallet
router.post("/fund", ...adminGuard, controller.fund.bind(controller));

module.exports = router;
