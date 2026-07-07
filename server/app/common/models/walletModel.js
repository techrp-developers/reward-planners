const db = require("../../../config/database");
const fs = require("fs");
const path = require("path");
const { FIRST_LOGIN_REWARD_COINS } = require("../constants/rewards");

class WalletModel {
  // create wallet
  async createWalletOnFirstLogin(userId) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const EXPIRY_MONTHS = parseInt(
        process.env.WALLET_EXPIRY_MONTHS || "3",
        10,
      );

      // check wallet
      const [wallet] = await conn.execute(
        `SELECT wallet_id
         FROM customer_wallet
         WHERE user_id = ?`,
        [userId],
      );

      if (wallet.length > 0) {
        await conn.commit();
        return false;
      }

      // create wallet
      await conn.execute(
        `INSERT INTO customer_wallet
        (user_id, balance)
        VALUES (?, ?)`,
        [userId, FIRST_LOGIN_REWARD_COINS],
      );

      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + EXPIRY_MONTHS);

      // insert transaction
      await conn.execute(
        `INSERT INTO wallet_transactions
        (user_id, title, description, transaction_type, coins, category, expiry_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          "Welcome Bonus",
          "First login reward",
          "credit",
          FIRST_LOGIN_REWARD_COINS,
          "reward",
          expiryDate,
        ],
      );

      await conn.commit();

      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // Get wallet
  async getWalletSummary(userId) {
    const [[wallet]] = await db.execute(
      `SELECT balance
     FROM customer_wallet
     WHERE user_id = ?`,
      [userId],
    );

    const [[expiry]] = await db.execute(
      `SELECT 
        SUM(coins) AS expiring_coins,
        MIN(expiry_date) AS expiry_date
     FROM wallet_transactions
     WHERE user_id = ?
     AND transaction_type = 'credit'
     AND expiry_date IS NOT NULL
     AND expiry_date > NOW()`,
      [userId],
    );

    return {
      balance: wallet?.balance ?? 0,
      expiring_coins: expiry?.expiring_coins || 0,
      expiry_date: expiry?.expiry_date || null,
    };
  }

  // Get wallet transactions
  async getWalletTransactions(userId, type, page, limit) {
    let condition = "";

    if (type === "credit") {
      condition = "AND transaction_type = 'credit'";
    } else if (type === "debit") {
      condition = "AND transaction_type = 'debit'";
    } else if (type === "expired") {
      condition = "AND expiry_date IS NOT NULL AND expiry_date < NOW()";
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const [rows] = await db.execute(
      `SELECT
      transaction_id,
      title,
      description,
      transaction_type,
      coins,
      category,
      created_at,
      expiry_date,
      CASE 
        WHEN expiry_date IS NOT NULL AND expiry_date < NOW()
        THEN 1 ELSE 0 
      END AS is_expired
     FROM wallet_transactions
     WHERE user_id = ?
     ${condition}
     ORDER BY transaction_id DESC
     LIMIT ? OFFSET ?`,

      [userId, limitNum, offset],
    );

    return rows;
  }
}

module.exports = new WalletModel();
