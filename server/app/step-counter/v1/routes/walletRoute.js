const express = require("express");
const router = express.Router();
const WalletController = require("../controllers/walletController");
const auth = require("../../../common/middlewares/auth");

// Wallet
router.get("/steps-history", auth, WalletController.getWalletHistory);

router.get("/steps-summary", auth, WalletController.getWalletSummary);

module.exports = router;
