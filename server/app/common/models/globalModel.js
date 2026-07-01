const db = require("../../../config/database");
const ProductModel = require("../../ecommerce/v1/models/productModel");
const ServiceModel = require("../../service/v1/models/serviceModel");

class GlobalModel {
  async getGlobalSuggestions(search) {
    const result = {};

    result.products = await ProductModel.getSearchSuggestions({
      search,
      limit: 5,
    });

    result.services = await ServiceModel.getSearchSuggestions({
      search,
      limit: 5,
    });

    return result;
  }

  // Points credit to the user
  async creditWalletByEmail({ email, coins, title, description }) {
    const conn = await db.getConnection();
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    try {
      await conn.beginTransaction();

      const [users] = await conn.execute(
        `SELECT user_id,name,email
       FROM customer
       WHERE email = ?
       LIMIT 1`,
        [normalizedEmail],
      );

      if (!users.length) {
        throw new Error("Customer not found");
      }

      const user = users[0];

      const [wallets] = await conn.execute(
        `SELECT wallet_id,balance
       FROM customer_wallet
       WHERE user_id = ?
       FOR UPDATE`,
        [user.user_id],
      );

      if (!wallets.length) {
        throw new Error("Wallet not found");
      }

      const wallet = wallets[0];

      const newBalance = Number(wallet.balance) + Number(coins);

      await conn.execute(
        `UPDATE customer_wallet
       SET balance = ?
       WHERE wallet_id = ?`,
        [newBalance, wallet.wallet_id],
      );

      const [txResult] = await conn.execute(
        `INSERT INTO wallet_transactions
      (
        user_id,
        title,
        description,
        transaction_type,
        coins,
        balance_after,
        category,
        reason_code
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.user_id,
          title,
          description,
          "credit",
          coins,
          newBalance,
          "admin",
          "ADMIN_ADJUSTMENT",
        ],
      );

      await conn.commit();

      return {
        user,
        coins,
        balance: newBalance,
        transactionId: txResult.insertId,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // single company employees
  async getEmployeesForCampaign(companyId) {
    const [rows] = await db.execute(
      `SELECT
        id,
        company_id,
        name,
        email,
        contact
     FROM company_users
     WHERE company_id = ?
       AND status = 1
       AND email IS NOT NULL
       AND TRIM(email) <> ''
       AND LOWER(TRIM(email)) NOT LIKE 'temp%'
       AND contact IS NOT NULL
       AND TRIM(contact) <> ''`,
      [companyId],
    );

    return rows;
  }

  // all the employees
  async getCampaignRecipients() {
    const [rows] = await db.execute(
      `SELECT
        id,
        company_id,
        name,
        contact
     FROM company_users
     WHERE status = 1
       AND contact IS NOT NULL
       AND TRIM(contact) <> ''`,
    );

    return rows;
  }
}

module.exports = new GlobalModel();
