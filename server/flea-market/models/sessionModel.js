const db = require("../../config/database");
const { SESSION_TTL_MINUTES } = require("../constants");

class SessionModel {
  async create({ sessionId, userId, companyId, locationId, operatorId }) {
    await db.execute(
      `INSERT INTO flea_market_sessions
        (session_id, user_id, company_id, location_id, operator_id, otp_verified_at, expires_at, status)
       VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE), 'active')`,
      [sessionId, userId, companyId, locationId, operatorId || null, SESSION_TTL_MINUTES],
    );
  }

  // A customer picked from search but not yet OTP-proven — enough to build a
  // cart and scope product search to the location, not enough to redeem
  // reward points or touch the wallet (see requireFleaMarketSession's
  // `verified` flag and checkoutService's redemption guard). Verifying later
  // creates a brand new session via create() above rather than upgrading
  // this row in place — cart state lives client-side, so swapping the token
  // mid-build is harmless and keeps the two code paths independent.
  async createUnverified({ sessionId, userId, companyId, locationId, operatorId }) {
    await db.execute(
      `INSERT INTO flea_market_sessions
        (session_id, user_id, company_id, location_id, operator_id, otp_verified_at, expires_at, status)
       VALUES (?, ?, ?, ?, ?, NULL, DATE_ADD(NOW(), INTERVAL ? MINUTE), 'active')`,
      [sessionId, userId, companyId, locationId, operatorId || null, SESSION_TTL_MINUTES],
    );
  }

  // Accepts 'completed' sessions too (not just 'active') — checkout marks a
  // session completed, but the customer still needs it to fetch the
  // resulting invoice(s) via GET /invoices/:id right after. Only a truly
  // expired session (status or timestamp) is rejected.
  async findActive(sessionId) {
    const [rows] = await db.execute(
      `SELECT * FROM flea_market_sessions
       WHERE session_id = ? AND status IN ('active', 'completed') AND expires_at > NOW()`,
      [sessionId],
    );
    return rows[0];
  }

  // Sliding expiry: any authenticated activity extends the 15-minute inactivity window.
  async touchExpiry(sessionId) {
    await db.execute(
      `UPDATE flea_market_sessions SET expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE session_id = ?`,
      [SESSION_TTL_MINUTES, sessionId],
    );
  }

  async markCompleted(sessionId, conn = db) {
    await conn.execute(`UPDATE flea_market_sessions SET status = 'completed' WHERE session_id = ?`, [
      sessionId,
    ]);
  }
}

module.exports = new SessionModel();
