const db = require("../../config/database");

const WHATSAPP_MAX_ATTEMPTS = 5;

class OtpModel {
  async findLatestWhatsapp(phone, purpose) {
    const [rows] = await db.execute(
      `SELECT * FROM whatsapp_otps WHERE phone = ? AND purpose = ?`,
      [phone, purpose],
    );
    // UNIQUE(phone, purpose) — at most one row exists.
    return rows[0];
  }

  // whatsapp_otps has a UNIQUE(phone, purpose) constraint, so a resend upserts the same row.
  async upsertWhatsapp({ phone, purpose, otpHash, expiresAt }) {
    await db.execute(
      `INSERT INTO whatsapp_otps (phone, purpose, otp_hash, attempts, max_attempts, expires_at, last_sent_at, locked_until, status)
       VALUES (?, ?, ?, 0, ?, ?, NOW(), NULL, 'pending')
       ON DUPLICATE KEY UPDATE
         otp_hash = VALUES(otp_hash),
         attempts = 0,
         max_attempts = VALUES(max_attempts),
         expires_at = VALUES(expires_at),
         last_sent_at = NOW(),
         locked_until = NULL,
         status = 'pending'`,
      [phone, purpose, otpHash, WHATSAPP_MAX_ATTEMPTS, expiresAt],
    );
  }

  async incrementWhatsappAttempts(id) {
    await db.execute(`UPDATE whatsapp_otps SET attempts = attempts + 1 WHERE id = ?`, [id]);
  }

  async lockWhatsapp(id, lockedUntil) {
    await db.execute(`UPDATE whatsapp_otps SET locked_until = ?, status = 'blocked' WHERE id = ?`, [
      lockedUntil,
      id,
    ]);
  }

  async markWhatsappVerified(id) {
    await db.execute(`UPDATE whatsapp_otps SET status = 'verified' WHERE id = ?`, [id]);
  }

  async findLatestEmail(email) {
    const [rows] = await db.execute(
      `SELECT * FROM email_otps WHERE email = ? ORDER BY id DESC LIMIT 1`,
      [email],
    );
    return rows[0];
  }

  // email_otps stores the OTP in plaintext per the existing schema — known security debt, not changed here.
  async insertEmail({ email, otp, expiry }) {
    const [result] = await db.execute(
      `INSERT INTO email_otps (email, otp, expiry, attempt_count, is_verified) VALUES (?, ?, ?, 0, 0)`,
      [email, otp, expiry],
    );
    return result.insertId;
  }

  async incrementEmailAttempts(id) {
    await db.execute(`UPDATE email_otps SET attempt_count = attempt_count + 1 WHERE id = ?`, [id]);
  }

  async markEmailVerified(id) {
    await db.execute(`UPDATE email_otps SET is_verified = 1 WHERE id = ?`, [id]);
  }
}

module.exports = new OtpModel();
