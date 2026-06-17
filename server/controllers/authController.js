const bcrypt = require("bcryptjs");
const db = require("../config/database");
const { generateToken } = require("../utils/jwt");
const { generateOTP, hashOTP } = require("../utils/otpGenerate");
const { sendOtpEmail, sendPasswordResetEmail } = require("../config/mail");
const { sendRegistrationSuccessMail } = require("../services/mailBuilder/authNotification");
const crypto = require("crypto");

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const authController = {
  /* ============================================================
       REGISTER USER (Auto-create vendor if role = vendor)
     ============================================================ */
  register: async (req, res, forcedRole = null) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const { name, email, password, phone } = req.body;
      const role = forcedRole || req.body.role;
      const normalizedEmail = normalizeEmail(email);

      if (!name || !normalizedEmail || !password || !role) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Name, Email, password and role are required",
        });
      }

      if (password.length < 8) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters long",
        });
      }

      const [existing] = await connection.execute(
        "SELECT user_id FROM eusers WHERE email = ?",
        [normalizedEmail],
      );

      if (existing.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "User already exists",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      // Create User
      const [insertUser] = await connection.execute(
        "INSERT INTO eusers (name, email, password, role, phone, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
        [name, normalizedEmail, hashedPassword, role, phone || null],
      );

      //  Otp Creation
      const otp = generateOTP();
      const otpHash = hashOTP(otp);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await connection.execute("DELETE FROM user_otps WHERE user_id = ?", [
        insertUser.insertId,
      ]);

      await connection.execute(
        `INSERT INTO user_otps (user_id, otp_hash, expires_at)
         VALUES (?, ?, ?)`,
        [insertUser.insertId, otpHash, expiresAt],
      );

      // vendor creation
      if (role === "vendor") {
        await connection.execute(
          "INSERT INTO vendors (user_id, status, created_at) VALUES (?, 'pending', NOW())",
          [insertUser.insertId],
        );
      }

      await connection.commit();

      try {
        await sendOtpEmail(normalizedEmail, otp);
      } catch (mailErr) {
        console.error("Email failed:", mailErr);
      }

      return res.status(201).json({
        success: true,
        message: "OTP sent to your email",
        data: {
          user_id: insertUser.insertId,
          email: normalizedEmail,
        },
      });
    } catch (err) {
      await connection.rollback();
      console.error("Registration Error:", err);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    } finally {
      connection.release();
    }
  },

  /* ============================================================
       Verify OTP
     ============================================================ */
  verifyOtp: async (req, res) => {
    const { email, otp } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !otp) {
      return res.status(400).json({ success: false, message: "Missing data" });
    }

    const otpHash = hashOTP(otp);

    const [rows] = await db.execute(
      `
      SELECT u.user_id, u.role,u.phone, u.email
        FROM eusers u
        JOIN user_otps o ON o.user_id = u.user_id
        WHERE u.email = ?
          AND o.otp_hash = ?
          AND o.expires_at > NOW()
        ORDER BY o.created_at DESC
        LIMIT 1
    `,
      [normalizedEmail, otpHash],
    );

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    const user = rows[0];

    await db.execute("UPDATE eusers SET is_verified = 1 WHERE user_id = ?", [
      user.user_id,
    ]);

    await db.execute("DELETE FROM user_otps WHERE user_id = ?", [user.user_id]);

    let vendorData = null;

    if (user.role === "vendor") {
      const [data] = await db.execute(
        "SELECT * from vendors where user_id= ?",
        [user.user_id],
      );

      if (data.length > 0) {
        vendorData = {
          vendor_id: data[0].vendor_id,
          status: data[0].status,
        };
      }
    }
    const token = generateToken({
      user_id: user.user_id,
      vendor_id: vendorData?.vendor_id || null,
      role: user.role,
      email: user.email,
    });

    // Send mail
    try {
      await sendRegistrationSuccessMail(
        {
          email: user.email,
          role: user.role,
        },
        vendorData,
      );
    } catch (mailErr) {
      console.error("REGISTRATION MAIL FAILED:", mailErr);
    }

    return res.json({
      success: true,
      message: `${user.role} registered successfully`,
      data: {
        user: {
          user_id: user.user_id,
          role: user.role,
          email: user.email,
          phone: user.phone,
        },
        vendor: vendorData,
        token,
      },
    });
  },

  // resend OTP
  resendOtp: async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const [users] = await db.execute(
      "SELECT user_id FROM eusers WHERE email = ?",
      [normalizedEmail],
    );

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userId = users[0].user_id;

    await db.execute("DELETE FROM user_otps WHERE user_id = ?", [userId]);

    const otp = generateOTP();
    const otpHash = hashOTP(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.execute(
      `INSERT INTO user_otps (user_id, otp_hash, expires_at)
     VALUES (?, ?, ?)`,
      [userId, otpHash, expiresAt],
    );

    // Send mail
    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (mailErr) {
      console.error("OTP MAIL FAILED:", mailErr);
    }

    return res.json({
      success: true,
      message: "OTP resent successfully",
    });
  },

  /* ============================================================
       Forgot Password
     ============================================================ */

  forgotPassword: async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);

    const genericResponse = {
      success: true,
      message: "If the email exists, a reset link has been sent",
    };

    if (!normalizedEmail) return res.json(genericResponse);

    const [users] = await db.execute(
      "SELECT user_id, email FROM eusers WHERE email = ?",
      [normalizedEmail],
    );

    if (!users.length) {
      return res.json(genericResponse);
    }

    const user = users[0];

    // Invalidate old tokens
    await db.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", [
      user.user_id,
    ]);

    // Generate secure token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.execute(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
      [user.user_id, tokenHash, expiresAt],
    );

    const resetLink = `https://rewardplanners.com/crm/reset-password?token=${rawToken}`;

    // Send mail
    try {
      await sendPasswordResetEmail(user.email, resetLink);
    } catch (mailErr) {
      console.error("PASSWORD RESET MAIL FAILED:", mailErr);
    }

    return res.json(genericResponse);
  },

  resetPassword: async (req, res) => {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const [rows] = await db.execute(
      `
    SELECT user_id
    FROM password_reset_tokens
    WHERE token_hash = ?
      AND expires_at > NOW()
    LIMIT 1
    `,
      [tokenHash],
    );

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset link",
      });
    }

    const userId = rows[0].user_id;
    const hashedPassword = await bcrypt.hash(password, 12);

    await db.execute("UPDATE eusers SET password = ? WHERE user_id = ?", [
      hashedPassword,
      userId,
    ]);

    await db.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", [
      userId,
    ]);

    return res.json({
      success: true,
      message: "Password reset successfully",
    });
  },

  /* ============================================================
       LOGIN USER (Loads correct vendor_id)
     ============================================================ */
  login: async (req, res, forcedRole = null) => {
    try {
      const { email, password } = req.body;
      const normalizedEmail = normalizeEmail(email);

      if (!normalizedEmail || !password) {
        return res.status(400).json({
          success: false,
          message: "Email and password are required",
        });
      }

      const [rows] = await db.execute("SELECT * FROM eusers WHERE email = ?", [
        normalizedEmail,
      ]);

      if (rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      const user = rows[0];
      const { password: _password, ...safeUser } = user;

      // if (forcedRole && user.role !== forcedRole) {
      //   return res.status(401).json({
      //     success: false,
      //     message: "Invalid email or password",
      //   });
      // }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      if (Number(user.is_verified) !== 1) {
        //  Resend OTP
        const otp = generateOTP();
        const otpHash = hashOTP(otp);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        // Remove old OTPs
        await db.execute("DELETE FROM user_otps WHERE user_id = ?", [
          user.user_id,
        ]);

        await db.execute(
          `INSERT INTO user_otps (user_id, otp_hash, expires_at)
           VALUES (?, ?, ?)`,
          [user.user_id, otpHash, expiresAt],
        );

        try {
          await sendOtpEmail(user.email, otp);
        } catch (mailErr) {
          console.error("OTP mail failed:", mailErr);
        }

        return res.status(403).json({
          success: false,
          code: "USER_NOT_VERIFIED",
          message: "Account not verified. OTP resent.",
          data: {
            email: user.email,
            role: user.role,
          },
        });
      }

      let vendorData = null;
      let vendorId = null;

      if (user.role === "vendor") {
        const [vendorRows] = await db.execute(
          `SELECT *
           FROM vendors
           WHERE user_id = ?
           ORDER BY 
             CASE status 
               WHEN 'approved' THEN 1
               WHEN 'pending' THEN 2
               ELSE 3
             END,
             vendor_id DESC
           LIMIT 1`,
          [user.user_id],
        );

        if (vendorRows.length > 0) {
          vendorData = vendorRows[0];
          vendorId = vendorData.vendor_id;
        }
      }

      //  MUST include vendor_id in token
      const token = generateToken({
        user_id: user.user_id,
        vendor_id: vendorId,
        email: user.email,
        role: user.role,
      });

      return res.json({
        success: true,
        message: "Login successful",
        data: {
          user: safeUser,
          vendor: vendorData,
          token,
        },
      });
    } catch (err) {
      console.error("Login Error:", err);
      return res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  },

  /* ============================================================
       PROFILE
     ============================================================ */
  getProfile: async (req, res) => {
    try {
      const [rows] = await db.execute(
        "SELECT user_id, name, email, role, phone FROM eusers WHERE user_id = ?",
        [req.user.user_id],
      );

      if (rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      return res.json({
        success: true,
        data: rows[0],
      });
    } catch (err) {
      console.error("Profile Error:", err);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  /* ============================================================
       LOGOUT
     ============================================================ */
  logout: (req, res) => {
    res.clearCookie();
    return res.json({ success: true, message: "Logout successful" });
  },

  /* ============================================================
      PASSWORD RESET
     ============================================================ */
  passwordReset: async (req, res) => {
    try {
      const { email, currentPassword, newPassword } = req.body;
      const normalizedEmail = normalizeEmail(email);

      if (!normalizedEmail || !currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Email, current password and new password are required",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 8 characters",
        });
      }

      const [rows] = await db.execute(
        "SELECT password FROM eusers WHERE email = ?",
        [normalizedEmail],
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const user = rows[0];

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);

      await db.execute("UPDATE eusers SET password = ? WHERE email = ?", [
        hashedPassword,
        normalizedEmail,
      ]);

      return res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (err) {
      console.error("Change Password Error:", err);
      return res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  },

  /* ============================================================
      STATES
     ============================================================ */
  getAllStates: async (req, res) => {
    try {
      const [rows] = await db.execute(
        `SELECT 
            state_id,
            state_name,
            status,
            created_at
         FROM states
         WHERE status = 1 AND country_id=75
         ORDER BY state_name ASC`,
      );

      return res.status(200).json({
        success: true,
        message: "States fetched successfully",
        data: rows,
      });
    } catch (error) {
      console.error("Error fetching states:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch states",
        error: error.message,
      });
    }
  },
};

module.exports = authController;
