const WalletModel = require("../models/walletModel");
const db = require("../../../config/database");
const fs = require("fs");
const path = require("path");

class WalletController {
  // get balance
  async getWallet(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const wallet = await WalletModel.getWalletSummary(userId);

      return res.json({
        success: true,
        data: wallet,
      });
    } catch (err) {
      return res.status(500).json({ success: false });
    }
  }

  //   wallet transactions
  async getWalletTransactions(req, res) {
    try {
      const userId = req.user.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { type = "all", page = 1, limit = 10 } = req.query;

      const transactions = await WalletModel.getWalletTransactions(
        userId,
        type,
        page,
        limit,
      );

      return res.json({
        success: true,
        data: transactions,
      });
    } catch (err) {
      return res.status(500).json({ success: false });
    }
  }
}
module.exports = new WalletController();
