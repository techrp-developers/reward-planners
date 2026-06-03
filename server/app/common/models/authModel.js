const db = require("../../../config/database");
const fs = require("fs");
const path = require("path");

class authModel {
  /* ======================================================
     BASIC USER QUERIES
  ====================================================== */
  async findByEmail(email) {
    const [rows] = await db.execute(
      `SELECT 
        user_id,
        name,
        email,
        password,
        status,
        is_verified,
        device_id,
        device_name
     FROM customer
     WHERE email = ?`,
      [email],
    );

    return rows[0];
  }

  async findByCompanyUserId(company_user_id) {
    const [rows] = await db.execute(
      `SELECT user_id, name, email, company_user_id
     FROM customer
     WHERE company_user_id = ?`,
      [company_user_id],
    );
    return rows[0];
  }

  async findById(userId) {
    const [rows] = await db.execute(
      ` SELECT
        user_id,
        name,
        email,
        status,
        is_verified,
        last_login_at
       FROM customer
       WHERE user_id = ?`,
      [userId],
    );
    return rows[0];
  }

  /* ======================================================
     ACCOUNT ACTIVATION
  ====================================================== */

  async findEmployeeByEmail(email) {
    const [rows] = await db.execute(
      `SELECT 
        id,
        company_id,
        name,
        email,
        contact AS phone
     FROM company_users
     WHERE email = ? AND status = 1
     LIMIT 1`,
      [email.toLowerCase()],
    );

    return rows[0];
  }

  async storeActivationOTP(email, otp) {
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    await db.execute(
      `INSERT INTO email_otps
     (email, otp, expiry)
     VALUES (?, ?, ?)`,
      [email.toLowerCase(), otp, expiry],
    );
  }

  async deleteOTPByEmail(email) {
    await db.execute(`DELETE FROM email_otps WHERE email = ?`, [
      email.toLowerCase(),
    ]);
  }

  async verifyOTP(email, otp) {
    const [rows] = await db.execute(
      `SELECT id, attempt_count
     FROM email_otps
     WHERE email = ?
     AND otp = ?
     AND expiry > NOW()
     LIMIT 1`,
      [email, otp],
    );

    return rows[0];
  }

  async incrementOtpAttempts(email) {
    await db.execute(
      `UPDATE email_otps
     SET attempt_count = attempt_count + 1
     WHERE email = ?`,
      [email],
    );
  }

  async getOtpAttempts(email) {
    const [rows] = await db.execute(
      `SELECT attempt_count
     FROM email_otps
     WHERE email = ?
     ORDER BY id DESC
     LIMIT 1`,
      [email],
    );

    return rows[0];
  }

  async markOTPVerified(email) {
    await db.execute(
      `UPDATE email_otps
     SET is_verified = 1
     WHERE email = ?
     ORDER BY id DESC
     LIMIT 1`,
      [email],
    );
  }

  async checkOTPVerified(email) {
    const [rows] = await db.execute(
      `SELECT is_verified
     FROM email_otps
     WHERE email = ?
     ORDER BY id DESC
     LIMIT 1`,
      [email],
    );

    return rows[0]?.is_verified === 1;
  }

  async deleteOTP(email, conn) {
    await conn.execute(
      `DELETE FROM email_otps
     WHERE email = ?`,
      [email.toLowerCase()],
    );
  }

  async createCustomer(data, conn) {
    const { company_id, company_user_id, name, email, phone, password } = data;
    const normalizedPhone = phone ? phone : "";

    const [result] = await conn.execute(
      `INSERT INTO customer
     (
       company_id,
       company_user_id,
       name,
       email,
       phone,
       password,
       is_verified
     )
     VALUES (?,?, ?, ?, ?, ?, 1)`,
      [
        company_id,
        company_user_id,
        name,
        email.toLowerCase(),
        normalizedPhone,
        password,
      ],
    );

    return result.insertId;
  }

  async getUserPassword(conn, userId) {
    const [rows] = await conn.execute(
      `SELECT password FROM customer WHERE user_id = ?`,
      [userId],
    );

    return rows[0];
  }

  async updatePassword(conn, userId, hashedPassword) {
    await conn.execute(
      `UPDATE customer
       SET password = ?
       WHERE user_id = ?`,
      [hashedPassword, userId],
    );
  }

  /* ======================================================
     LOGIN TRACKING
  ====================================================== */

  async updateLoginMeta(userId, ipAddress) {
    await db.execute(
      `UPDATE customer
       SET last_login_at = NOW(),
           last_login_ip = ?
       WHERE user_id = ?`,
      [ipAddress, userId],
    );
  }

  async clearFcmToken(userId) {
    await db.execute(
      `UPDATE customer
     SET fcm_token = NULL
     WHERE user_id = ?`,
      [userId],
    );
  }

  async updateFcmToken(userId, fcmToken) {
    await db.execute(
      `UPDATE customer
     SET fcm_token = ?
     WHERE user_id = ?`,
      [fcmToken, userId],
    );
  }

  // Customer Info
  async getUserInfo(userId) {
    const [[user]] = await db.execute(
      `
    SELECT 
      cu.user_id,
      cu.name,
      cu.email,
      cu.phone,

      cw.balance AS reward_points,

      ca.address_id,
      ca.address_type,
      ca.address1,
      ca.address2,
      ca.city,
      ca.zipcode,
      ca.landmark,

      s.state_name,
      c.country_name

    FROM customer cu

    LEFT JOIN customer_wallet cw
    ON cu.user_id = cw.user_id

    LEFT JOIN customer_addresses ca
      ON cu.user_id = ca.user_id
      AND ca.is_default = 1
      AND ca.status = 1

    LEFT JOIN states s
      ON ca.state_id = s.state_id

    LEFT JOIN countries c
      ON ca.country_id = c.country_id

    WHERE cu.user_id = ?
      AND cu.status = 1

    LIMIT 1
    `,
      [userId],
    );

    if (!user) return null;

    return {
      userId: user.user_id,
      name: user.name,
      email: user.email,
      phone: user.phone,

      rewardPoints: user.reward_points ?? 0,

      defaultAddress: user.address_id
        ? {
            addressId: user.address_id,
            type: user.address_type,
            line1: user.address1,
            line2: user.address2,
            city: user.city,
            state: user.state_name,
            country: user.country_name,
            zipcode: user.zipcode,
            landmark: user.landmark,
          }
        : null,
    };
  }

  // Delete Customer
  async deleteCustomerAccount(userId) {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Soft delete customer
      await connection.execute(
        `UPDATE customer
       SET status = 0
       WHERE user_id = ?`,
        [userId],
      );

      // Remove cart items
      await connection.execute(`DELETE FROM cart_items WHERE user_id = ?`, [
        userId,
      ]);

      // Remove wishlist
      await connection.execute(
        `DELETE FROM customer_wishlist WHERE user_id = ?`,
        [userId],
      );

      // Remove addresses
      await connection.execute(
        `DELETE FROM customer_addresses WHERE user_id = ?`,
        [userId],
      );

      // Remove notifications
      await connection.execute(`DELETE FROM notifications WHERE user_id = ?`, [
        userId,
      ]);

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }
}

module.exports = new authModel();
