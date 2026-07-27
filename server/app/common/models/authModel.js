const db = require("../../../config/database");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const { getPublicUrl } = require("../../../utils/publicUrl");

class authModel {
  /* ======================================================
     BASIC USER QUERIES
  ====================================================== */
  // async findByEmail(email) {
  //   const [rows] = await db.execute(
  //     `SELECT
  //       user_id,
  //       name,
  //       email,
  //       password,
  //       status,
  //       is_verified,
  //       // COALESCE(token_version, 0) AS token_version,
  //       device_id,
  //       device_name
  //    FROM customer
  //    WHERE email = ?`,
  //     [email],
  //   );

  //   return rows[0];
  // }

  async findByEmail(email) {
    const [rows] = await db.execute(
      `SELECT 
        user_id,
        name,
        email,
        phone,
        company_user_id,
        (SELECT company_id
           FROM company_users
          WHERE id = customer.company_user_id
          LIMIT 1) AS company_id,
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

  async findByEmailOrPhone({ email, phone }) {
    const conditions = [];
    const params = [];

    if (email) {
      conditions.push("LOWER(TRIM(email)) = ?");
      params.push(email);
    }

    if (phone) {
      conditions.push("phone = ?");
      params.push(phone);
    }

    if (!conditions.length) return null;

    const [rows] = await db.execute(
      `SELECT 
        user_id,
        name,
        email,
        phone,
        company_user_id,
        password,
        status,
        is_verified,
        device_id,
        device_name
     FROM customer
     WHERE ${conditions.join(" OR ")}
     LIMIT 1`,
      params,
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

  async findEmployeeById(employeeId) {
    const [rows] = await db.execute(
      `SELECT 
        id,
        company_id,
        name,
        email,
        contact AS phone
     FROM company_users
     WHERE id = ? AND status = 1
     LIMIT 1`,
      [employeeId],
    );

    return rows[0];
  }

  // async findById(userId) {
  //   const [rows] = await db.execute(
  //     ` SELECT
  //       user_id,
  //       name,
  //       email,
  //       status,
  //       is_verified,
  //       COALESCE(token_version, 0) AS token_version,
  //       last_login_at
  //      FROM customer
  //      WHERE user_id = ?`,
  //     [userId],
  //   );
  //   return rows[0];
  // }

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

  async findEmployeeByPhone(phone) {
    const [rows] = await db.execute(
      `SELECT
        id,
        company_id,
        name,
        email,
        contact AS phone
     FROM company_users
     WHERE TRIM(contact) = ? AND status = 1
     LIMIT 1`,
      [phone],
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

  // async verifyOTP(email, otp) {
  //   const [rows] = await db.execute(
  //     `SELECT id, otp, attempt_count
  //    FROM email_otps
  //    WHERE email = ?
  //    AND expiry > NOW()
  //    ORDER BY id DESC
  //    LIMIT 1`,
  //     [email],
  //   );

  //   const otpRecord = rows[0];
  //   if (!otpRecord) return null;

  //   const isMatch = await bcrypt.compare(otp.toString(), otpRecord.otp);
  //   if (!isMatch) return null;

  //   return {
  //     id: otpRecord.id,
  //     attempt_count: otpRecord.attempt_count,
  //   };
  // }

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
        email ? email.toLowerCase() : null,
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

  // async updatePassword(conn, userId, hashedPassword) {
  //   await conn.execute(
  //     `UPDATE customer
  //      SET password = ?,
  //          token_version = COALESCE(token_version, 0) + 1
  //      WHERE user_id = ?`,
  //     [hashedPassword, userId],
  //   );
  // }

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

  // async incrementTokenVersion(userId) {
  //   await db.execute(
  //     `UPDATE customer
  //      SET token_version = COALESCE(token_version, 0) + 1
  //      WHERE user_id = ?`,
  //     [userId],
  //   );
  // }

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
      cu.user_image,
      cu.created_at,
      cu.updated_at,

      cw.balance AS reward_points,

      comp.company_name,
      comp.company_logo,
      comp.updated_at AS company_updated_at,

      cu_emp.date_of_joining,
      cu_emp.company_id,
      cu_emp.role,
      cu_emp.dob,
      cu_emp.department,

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

    LEFT JOIN company_users cu_emp
    ON cu.company_user_id = cu_emp.id

    LEFT JOIN companies comp
    ON cu_emp.company_id = comp.company_id

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
      userImage: getPublicUrl(user.user_image, user.updated_at),
      created_at: user.created_at,
      rewardPoints: user.reward_points ?? 0,

      company: user.company_id
        ? {
            name: user.company_name,
            logo: getPublicUrl(user.company_logo, user.company_updated_at),
          }
        : null,

      employeeInfo: user.company_id
        ? {
            dateOfJoining: user.date_of_joining,
            role: user.role,
            date_of_birth: user.dob,
            department: user.department,
          }
        : null,

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

  // Get employee birthday
  async getTodayBirthdayEmployees(userId) {
    const [rows] = await db.execute(
      `
    SELECT
      cu_emp.id,
      cu_emp.name,
      cu_emp.email,
      cu_emp.contact,
      cu_emp.department,
      cu_emp.role,
      cu_emp.dob,
      c.user_image,
      c.updated_at AS user_image_updated_at
    FROM customer c_logged

    INNER JOIN company_users cu_logged
      ON c_logged.company_user_id = cu_logged.id

    INNER JOIN company_users cu_emp
      ON cu_logged.company_id = cu_emp.company_id

    LEFT JOIN customer c
      ON c.company_user_id = cu_emp.id

    WHERE c_logged.user_id = ?
      AND MONTH(cu_emp.dob) = MONTH(CURDATE())
      AND DAY(cu_emp.dob) = DAY(CURDATE())
      AND cu_emp.status = 1
    `,
      [userId],
    );

    return rows.map((emp) => ({
      employeeId: emp.id,
      name: emp.name,
      email: emp.email,
      phone: emp.contact,
      department: emp.department,
      role: emp.role,
      dob: emp.dob,
      image: getPublicUrl(emp.user_image, emp.user_image_updated_at),
    }));
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

  // Get profile for update
  async getProfile(conn, userId) {
    const [rows] = await conn.execute(
      `SELECT user_id, phone, user_image
     FROM customer
     WHERE user_id = ?`,
      [userId],
    );

    return rows[0];
  }

  // update profile
  async updateProfile(conn, userId, data) {
    await conn.execute(
      `UPDATE customer
     SET phone = ?, user_image = ?
     WHERE user_id = ?`,
      [data.phone, data.user_image, userId],
    );
  }
}

module.exports = new authModel();
