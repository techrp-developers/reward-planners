const db = require("../../../../config/database");

class TransactionModel {
  // create a new transaction
  async create(data, conn = db) {
    const sql = `
    INSERT INTO bbps_transactions 
    (user_id, operator_id, utility_acc_no, cycle_number, confirmation_mobile_no,
     sender_name, amount, bbps_status, fetch_bill, bill_fetch_id,
     provider_client_ref_id, provider_bill_ref_id, recharge_plan_id,
     recharge_circle_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'INIT', ?, ?, ?, ?, ?, ?)
  `;
    const [res] = await conn.execute(sql, [
      data.user_id,
      data.operator_id,
      data.utility_acc_no?.trim(),
      data.cycle_number,
      data.confirmation_mobile_no || null,
      data.sender_name || null,
      data.amount,
      data.fetch_bill,
      data.bill_fetch_id || null,
      data.provider_client_ref_id || null,
      data.provider_bill_ref_id || null,
      data.recharge_plan_id || null,
      data.recharge_circle_id || null,
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

  // Get paginated order history for a user
  async getUserOrders({
    userId,
    status = null,
    search = null,
    fromDate = null,
    toDate = null,
    timeFilter = null,
    page = 1,
    limit = 10,
  }) {
    let whereSql = ` WHERE t.user_id = ?`;
    const params = [userId];

    if (status) {
      whereSql += ` AND t.bbps_status = ?`;
      params.push(status);
    }

    if (search) {
      whereSql += `
      AND (
        t.operator_id LIKE ?
        OR t.utility_acc_no LIKE ?
        OR t.confirmation_mobile_no LIKE ?
        OR t.provider_client_ref_id LIKE ?
      )
    `;

      const searchValue = `%${search}%`;

      params.push(searchValue, searchValue, searchValue, searchValue);
    }

    if (fromDate) {
      whereSql += ` AND DATE(t.created_at) >= ?`;
      params.push(fromDate);
    }

    if (toDate) {
      whereSql += ` AND DATE(t.created_at) <= ?`;
      params.push(toDate);
    }

    if (!fromDate && !toDate && timeFilter) {
      if (timeFilter === "30days") {
        whereSql += ` AND t.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
      } else if (timeFilter === "3months") {
        whereSql += ` AND t.created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)`;
      } else if (timeFilter === "6months") {
        whereSql += ` AND t.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)`;
      } else if (/^\d{4}$/.test(timeFilter)) {
        whereSql += ` AND YEAR(t.created_at) = ?`;
        params.push(Number(timeFilter));
      }
    }

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM bbps_transactions t${whereSql}`,
      params,
    );

    const offset = (page - 1) * limit;

    const [rows] = await db.execute(
      `SELECT
        t.id,
        t.operator_id,
        t.utility_acc_no,
        t.confirmation_mobile_no,
        t.sender_name,
        t.amount,
        t.bbps_status,
        t.provider_client_ref_id,
        t.created_at,
        ro.status AS payment_status,
        ro.razorpay_order_id,
        r.status AS refund_status
      FROM bbps_transactions t
      LEFT JOIN razorpay_orders ro
        ON ro.ref_id = t.id AND ro.module = 'bbps'
      LEFT JOIN bbps_refunds r
        ON r.transaction_id = t.id
      ${whereSql}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    return {
      orders: rows,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      currentPage: page,
    };
  }
}

module.exports = new TransactionModel();
