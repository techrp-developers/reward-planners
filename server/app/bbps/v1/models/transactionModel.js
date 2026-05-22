const db = require("../../../../config/database");

class TransactionModel {
  // create a new transaction
  async create(data, conn = db) {
    const sql = `
    INSERT INTO bbps_transactions 
    (user_id, operator_id, utility_acc_no, cycle_number, amount, bbps_status,fetch_bill)
    VALUES (?, ?, ?, ?, ?, 'INIT', ?)
  `;
    const [res] = await db.execute(sql, [
      data.user_id,
      data.operator_id,
      data.utility_acc_no?.trim(),
      data.cycle_number,
      data.amount,
      data.fetch_bill,
    ]);

    return res.insertId;
  }

  //  update Transaction status
  async updateStatus(id, status, response, conn = db) {
    await conn.execute(
      `UPDATE bbps_transactions SET bbps_status=?, bbps_response=? WHERE id=?`,
      [status, JSON.stringify(response), id],
    );
  }

  // get retryable transactions
  async getRetryable() {
    const [rows] = await db.execute(`
    SELECT * FROM bbps_transactions
    WHERE bbps_status = 'FAILED_RETRY'
    AND retry_count < max_retry
  `);

    return rows;
  }

  // Increment retry count
  async incrementRetry(id, conn = db) {
    await conn.execute(
      `UPDATE bbps_transactions 
       SET retry_count = retry_count + 1 
       WHERE id=?`,
      [id],
    );
  }

  // Get transaction By ID
  async getById(id) {
    const [rows] = await db.execute(
      `SELECT * FROM bbps_transactions WHERE id = ?`,
      [id],
    );

    return rows[0];
  }

  async getByIdForUpdate(id, conn) {
    const [rows] = await conn.execute(
      `SELECT * FROM bbps_transactions WHERE id=? FOR UPDATE`,
      [id],
    );
    return rows[0];
  }

  // Get transaction by status
  async getByStatus(status) {
    const [rows] = await db.execute(
      `SELECT * FROM bbps_transactions WHERE bbps_status = ?`,
      [status],
    );

    return rows;
  }

  // Mark final failure
  async markFinalFailure(id, response, conn = db) {
    await conn.execute(
      `UPDATE bbps_transactions 
       SET bbps_status='FAILED_FINAL', bbps_response=? 
       WHERE id=?`,
      [JSON.stringify(response), id],
    );
  }
}

module.exports = new TransactionModel();
