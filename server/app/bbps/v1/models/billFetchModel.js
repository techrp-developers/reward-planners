const db = require("../../../../config/database");

const configuredFetchTtl = Number(process.env.BBPS_FETCH_TTL_MINUTES || 15);
const FETCH_TTL_MINUTES =
  Number.isFinite(configuredFetchTtl) && configuredFetchTtl > 0
    ? configuredFetchTtl
    : 15;

class BillFetchModel {
  async create(data, conn = db) {
    const [result] = await conn.execute(
      `INSERT INTO bbps_bill_fetches
       (user_id, operator_id, utility_acc_no, cycle_number,
        confirmation_mobile_no, sender_name, amount, provider_ref_id,
        provider_response, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [
        data.user_id,
        data.operator_id,
        data.utility_acc_no,
        data.cycle_number || null,
        data.confirmation_mobile_no || null,
        data.sender_name || null,
        data.amount,
        data.provider_ref_id || null,
        JSON.stringify(data.provider_response || null),
        FETCH_TTL_MINUTES,
      ],
    );

    return result.insertId;
  }

  async getValidByIdForUpdate(id, userId, conn) {
    const [rows] = await conn.execute(
      `SELECT * FROM bbps_bill_fetches
       WHERE id = ?
         AND user_id = ?
         AND consumed_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [id, userId],
    );

    return rows[0] || null;
  }

  async markConsumed(id, conn = db) {
    await conn.execute(
      `UPDATE bbps_bill_fetches
       SET consumed_at = NOW()
       WHERE id = ? AND consumed_at IS NULL`,
      [id],
    );
  }
}

module.exports = new BillFetchModel();
