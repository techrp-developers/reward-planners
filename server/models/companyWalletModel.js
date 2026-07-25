const db = require("../config/database");

class CompanyWalletModel {
  async getSummary(companyId) {
    const [[wallet]] = await db.execute(
      `SELECT wallet_id, company_id, balance, created_at, updated_at
       FROM company_wallet
       WHERE company_id = ?`,
      [companyId],
    );

    const [[totals]] = await db.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN transaction_type = 'credit' THEN points ELSE 0 END), 0) AS total_credited,
         COALESCE(SUM(CASE WHEN transaction_type = 'debit' THEN points ELSE 0 END), 0) AS total_awarded,
         COUNT(CASE WHEN category = 'employee_reward' THEN 1 END) AS reward_count
       FROM company_wallet_transactions
       WHERE company_id = ?`,
      [companyId],
    );

    return {
      wallet_id: wallet?.wallet_id || null,
      company_id: companyId,
      balance: Number(wallet?.balance || 0),
      total_credited: Number(totals.total_credited || 0),
      total_awarded: Number(totals.total_awarded || 0),
      reward_count: Number(totals.reward_count || 0),
      created_at: wallet?.created_at || null,
      updated_at: wallet?.updated_at || null,
    };
  }

  async getTransactions({ companyId, type, page, limit }) {
    const conditions = ["cwt.company_id = ?"];
    const params = [companyId];
    if (["credit", "debit"].includes(type)) {
      conditions.push("cwt.transaction_type = ?");
      params.push(type);
    }

    const where = conditions.join(" AND ");
    const offset = (page - 1) * limit;
    const [rows] = await db.execute(
      `SELECT
         cwt.transaction_id, cwt.transaction_type, cwt.points,
         cwt.balance_after, cwt.category, cwt.employee_id,
         cwt.customer_id, cwt.title, cwt.description,
         cwt.reference_key, cwt.created_by, cwt.created_at,
         cu.name AS employee_name, eu.name AS created_by_name
       FROM company_wallet_transactions cwt
       LEFT JOIN company_users cu ON cu.id = cwt.employee_id
       LEFT JOIN eusers eu ON eu.user_id = cwt.created_by
       WHERE ${where}
       ORDER BY cwt.transaction_id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const [[count]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM company_wallet_transactions cwt
       WHERE ${where}`,
      params,
    );
    return { rows, total: Number(count.total) };
  }

  async awardEmployees({ companyId, employeeIds, points, title, description, referenceKey, createdBy }) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        `INSERT INTO company_wallet (company_id, balance)
         VALUES (?, 0)
         ON DUPLICATE KEY UPDATE company_id = VALUES(company_id)`,
        [companyId],
      );
      const [[wallet]] = await conn.execute(
        `SELECT wallet_id, balance FROM company_wallet
         WHERE company_id = ? FOR UPDATE`,
        [companyId],
      );

      const placeholders = employeeIds.map(() => "?").join(",");
      const [employees] = await conn.execute(
        `SELECT
           cu.id, cu.name, cu.status AS employee_status,
           c.user_id, c.status AS customer_status,
           COALESCE(c.email, cu.email) AS email,
           COALESCE(c.phone, cu.contact) AS phone
         FROM company_users cu
         LEFT JOIN customer c ON c.company_user_id = cu.id
         WHERE cu.company_id = ?
           AND cu.id IN (${placeholders})
         FOR UPDATE`,
        [companyId, ...employeeIds],
      );

      if (employees.length !== employeeIds.length) {
        const error = new Error("One or more selected employees do not belong to your company");
        error.code = "INVALID_EMPLOYEES";
        throw error;
      }

      const inactiveEmployees = employees.filter((employee) => Number(employee.employee_status) !== 1);
      if (inactiveEmployees.length) {
        const error = new Error(`${inactiveEmployees.map((employee) => employee.name).join(", ")} must be active before receiving points`);
        error.code = "INACTIVE_EMPLOYEES";
        throw error;
      }

      const notOnboarded = employees.filter((employee) => !employee.user_id);
      if (notOnboarded.length) {
        const error = new Error(`${notOnboarded.map((employee) => employee.name).join(", ")} needs to onboard and activate a customer account first`);
        error.code = "CUSTOMER_NOT_ONBOARDED";
        throw error;
      }

      const inactiveCustomers = employees.filter((employee) => Number(employee.customer_status) !== 1);
      if (inactiveCustomers.length) {
        const error = new Error(`${inactiveCustomers.map((employee) => employee.name).join(", ")}'s customer account is inactive`);
        error.code = "CUSTOMER_INACTIVE";
        throw error;
      }

      const totalPoints = points * employees.length;
      if (Number(wallet.balance) < totalPoints) {
        const error = new Error("Insufficient company wallet balance");
        error.code = "INSUFFICIENT_BALANCE";
        throw error;
      }

      let runningBalance = Number(wallet.balance);
      const awards = [];
      for (const employee of employees) {
        const employeeReference = `${referenceKey}:${employee.id}`;
        runningBalance -= points;
        const [ledger] = await conn.execute(
          `INSERT INTO company_wallet_transactions
           (company_id, transaction_type, points, balance_after, category,
            employee_id, customer_id, title, description, reference_key, created_by)
           VALUES (?, 'debit', ?, ?, 'employee_reward', ?, ?, ?, ?, ?, ?)`,
          [companyId, points, runningBalance, employee.id, employee.user_id,
            title, description, employeeReference, createdBy],
        );

        await conn.execute(
          `INSERT INTO customer_wallet (user_id, balance)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
          [employee.user_id, points],
        );
        const [[customerWallet]] = await conn.execute(
          `SELECT balance FROM customer_wallet WHERE user_id = ?`,
          [employee.user_id],
        );
        await conn.execute(
          `INSERT INTO wallet_transactions
           (user_id, title, description, transaction_type, coins,
            balance_after, category, reference_id, reason_code)
           VALUES (?, ?, ?, 'credit', ?, ?, 'admin', ?, 'ADMIN_ADJUSTMENT')`,
          [employee.user_id, title, description, points,
            customerWallet.balance, ledger.insertId],
        );
        awards.push({
          transaction_id: ledger.insertId,
          employee_id: employee.id,
          customer_id: employee.user_id,
          name: employee.name,
          email: employee.email,
          phone: employee.phone,
          points,
          balance: Number(customerWallet.balance),
        });
      }

      await conn.execute(
        `UPDATE company_wallet SET balance = ? WHERE wallet_id = ?`,
        [runningBalance, wallet.wallet_id],
      );
      await conn.commit();
      return { awards, total_points: totalPoints, balance: runningBalance };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async fund({ companyId, points, description, referenceKey, createdBy }) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO company_wallet (company_id, balance)
         VALUES (?, 0)
         ON DUPLICATE KEY UPDATE company_id = VALUES(company_id)`,
        [companyId],
      );
      const [[wallet]] = await conn.execute(
        `SELECT wallet_id, balance FROM company_wallet
         WHERE company_id = ? FOR UPDATE`,
        [companyId],
      );
      const balance = Number(wallet.balance) + points;
      await conn.execute(
        `UPDATE company_wallet SET balance = ? WHERE wallet_id = ?`,
        [balance, wallet.wallet_id],
      );
      const [transaction] = await conn.execute(
        `INSERT INTO company_wallet_transactions
         (company_id, transaction_type, points, balance_after, category,
          title, description, reference_key, created_by)
         VALUES (?, 'credit', ?, ?, 'funding', 'Company wallet funding', ?, ?, ?)`,
        [companyId, points, balance, description, referenceKey, createdBy],
      );
      await conn.commit();
      return { transaction_id: transaction.insertId, points, balance };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}

module.exports = new CompanyWalletModel();
