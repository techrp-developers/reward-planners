const express = require("express");
const router = express.Router();
const WalletController = require("../controller/walletController");
const auth = require("../middlewares/auth");
const optionalAuth = require("../middlewares/optionalAuth");

// check review eligibility
router.get("/balance", auth, WalletController.getWallet);

// wallet transactions
router.get("/transactions", auth, WalletController.getWalletTransactions);

module.exports = router;
