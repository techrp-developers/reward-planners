const AuthModel = require("../models/authModel");
const db = require("../../../config/database");
const AddressModel = require("../models/addressModel");
const WalletModel = require("../../common/models/walletModel");
const FitnessService = require("../../step-counter/v1/service/fitnessService");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  accountCreationSuccessMail,
} = require("../../../services/mailBuilder/accountCreation");
const {
  rewardCreditMail,
} = require("../../../services/mailBuilder/firstTimeReward");
const { sendOtpMail } = require("../../../services/mailBuilder/sendOtp");
const {
  enqueueWhatsApp,
} = require("../../../services/whatsapp/waEnqueueService");

const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES_DAYS = 7;

function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

const thoughts = [
  "Small progress is still progress.",
  "Consistency beats intensity.",
  "Your future is shaped by today's habits.",
  "Every step counts.",
  "Focus on progress, not perfection.",
  "Discipline creates freedom.",
  "What you do daily matters most.",
  "Energy grows with action.",
  "Success is built one day at a time.",
  "Healthy habits compound over time.",
  "Start where you are.",
  "Done is better than perfect.",
  "Keep showing up.",
  "Growth begins outside your comfort zone.",
  "Patience is part of the process.",
  "Your mindset shapes your reality.",
  "Small wins lead to big results.",
  "Believe in gradual improvement.",
  "Action creates momentum.",
  "You are stronger than your excuses.",
  "Progress thrives on consistency.",
  "Make today count.",
  "Success follows persistence.",
  "Good habits build great lives.",
  "Every day is a fresh start.",
  "Keep moving forward.",
  "Challenges create strength.",
  "Your effort is never wasted.",
  "Stay committed to your goals.",
  "One positive choice at a time.",
  "The best investment is in yourself.",
  "Results come from repetition.",
  "Learning never stops.",
  "Growth takes time.",
  "Be better than yesterday.",
  "Focus on what you can control.",
  "Motivation starts action; discipline keeps it going.",
  "Your habits define your future.",
  "Dream big, act small.",
  "Stay consistent even when it's hard.",
  "Progress is progress, no matter the pace.",
  "Take the next right step.",
  "Success begins with self-belief.",
  "Every effort adds up.",
  "Keep your promises to yourself.",
  "The journey matters as much as the destination.",
  "Confidence grows through action.",
  "Persistence beats talent when talent quits.",
  "Your potential is limitless.",
  "Today is another opportunity to improve.",
];

class AuthController {
  /* ======================================================
     ACTIVATE ACCOUNT
  ====================================================== */
  async activateAccount(req, res) {
    const { email } = req.body;

    const normalizedEmail = email.trim().toLowerCase();

    const employee = await AuthModel.findEmployeeByEmail(normalizedEmail);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const existingAccount = await AuthModel.findByCompanyUserId(employee.id);

    if (existingAccount) {
      return res.status(400).json({
        success: false,
        message: "Account already activated",
      });
    }

    await AuthModel.deleteOTPByEmail(normalizedEmail);

    const otp = generateOTP();

    await AuthModel.storeActivationOTP(normalizedEmail, otp);

    await sendOtpMail({
      email: normalizedEmail,
      name: employee.name,
      otp,
    });

    return res.json({
      success: true,
      message: "OTP sent to email",
    });
  }

  /* ======================================================
     RESEND ACTIVATION OTP
  ====================================================== */
  async resendActivationOTP(req, res) {
    try {
      const { email } = req.body;

      const normalizedEmail = email.trim().toLowerCase();

      const employee = await AuthModel.findEmployeeByEmail(normalizedEmail);

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      const existing = await AuthModel.findByCompanyUserId(employee.id);

      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Account already activated",
        });
      }

      await AuthModel.deleteOTPByEmail(normalizedEmail);

      const otp = generateOTP();

      await AuthModel.storeActivationOTP(normalizedEmail, otp);

      await sendOtpMail({
        email: normalizedEmail,
        name: employee.name,
        otp,
      });

      return res.json({
        success: true,
        message: "OTP resent successfully",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
      });
    }
  }

  /* ======================================================
   VERIFY OTP
====================================================== */
  async verifyActivationOTP(req, res) {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        return res.status(400).json({
          success: false,
          message: "Email and OTP are required",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const attempt = await AuthModel.getOtpAttempts(normalizedEmail);

      if (attempt && attempt.attempt_count >= 5) {
        return res.status(429).json({
          success: false,
          message: "Too many OTP attempts. Try again later.",
        });
      }

      const otpRecord = await AuthModel.verifyOTP(normalizedEmail, otp);

      if (!otpRecord) {
        await AuthModel.incrementOtpAttempts(normalizedEmail);

        return res.status(400).json({
          success: false,
          message: "Invalid or expired OTP",
        });
      }

      await AuthModel.markOTPVerified(normalizedEmail);

      return res.json({
        success: true,
        message: "OTP verified successfully",
      });
    } catch (err) {
      console.error("Verify activation OTP error:", err);

      return res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  }

  /* ======================================================
     SET PASSWORD
  ====================================================== */
  async setPassword(req, res) {
    const conn = await db.getConnection();
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: "Email and password are required",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters",
        });
      }

      const existing = await AuthModel.findByEmail(normalizedEmail);

      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Account already exists",
        });
      }

      const otpVerified = await AuthModel.checkOTPVerified(normalizedEmail);

      if (!otpVerified) {
        return res.status(403).json({
          success: false,
          message: "OTP verification required",
        });
      }

      const employee = await AuthModel.findEmployeeByEmail(normalizedEmail);

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      const hashedPassword = await bcrypt.hash(password.toString(), 12);

      await conn.beginTransaction();

      await AuthModel.createCustomer(
        {
          company_id: employee.company_id,
          company_user_id: employee.id,
          name: employee.name,
          email: employee.email,
          phone: employee.phone,
          password: hashedPassword,
        },
        conn,
      );

      await AuthModel.deleteOTP(normalizedEmail, conn);

      await conn.commit();

      setImmediate(() => {
        accountCreationSuccessMail({
          name: employee.name,
          email: employee.email,
        }).catch((err) => {
          console.error("Email send failed:", err);
        });
      });

      //  NON-BLOCKING WHATSAPP
      if (employee.phone) {
        setImmediate(() => {
          enqueueWhatsApp({
            eventName: "create_account_notification",
            ctx: {
              phone: employee.phone,
              company_id: employee.company_id ?? null,
              customer_name: employee.name || "User",
            },
          }).catch((err) => {
            console.error("WhatsApp enqueue failed:", err);
          });
        });
      }

      return res.json({
        success: true,
        message: "Account activated successfully",
      });
    } catch (err) {
      await conn.rollback();
      console.error("SET PASSWORD ERROR:", err);

      return res.status(500).json({
        success: false,
        message: "Server error",
      });
    } finally {
      conn.release();
    }
  }

  /* ======================================================
     LOGIN
  ====================================================== */
  async loginUser(req, res) {
    try {
      const { email, password } = req.body;
      const normalizedEmail = email.trim().toLowerCase();

      const user = await AuthModel.findByEmail(normalizedEmail);
      if (!user) return res.status(401).json({ success: false });

      if (Number(user.status) !== 1)
        return res
          .status(403)
          .json({ success: false, message: "Account inactive" });

      if (!user.is_verified)
        return res
          .status(403)
          .json({ success: false, message: "Email not verified" });

      const employee = await AuthModel.findEmployeeByEmail(normalizedEmail);

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ success: false });
      const accessToken = jwt.sign(
        { user_id: user.user_id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: ACCESS_EXPIRES },
      );

      const refreshToken = jwt.sign(
        { user_id: user.user_id },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: `${REFRESH_EXPIRES_DAYS}d` },
      );
      const expiryDate = new Date(
        Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
      );

      await AuthModel.updateLoginMeta(user.user_id, req.ip);

      const firstLoginBonus = await WalletModel.createWalletOnFirstLogin(
        user.user_id,
      );

      if (firstLoginBonus) {
        // Send Email
        await rewardCreditMail({
          email: user.email,
          name: user.name,
          coins: 3000,
        });

        // Send WhatsApp
        await enqueueWhatsApp({
          eventName: "wallet_credit_first_login",
          ctx: {
            phone: employee.phone,
            company_id: employee.company_id,
            customer_name: employee.name || "User",
            coins: 3000,
          },
        });
      }

      return res.json({
        success: true,
        accessToken,
        refreshToken,
        firstLoginReward: {
          awarded: firstLoginBonus,
          coins: firstLoginBonus ? 3000 : 0,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false });
    }
  }

  // Refresh
  async refreshAccessToken(req, res) {
    try {
      const { refreshToken } = req.body;

      const payload = jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET,
      );

      const user = await AuthModel.findById(payload.user_id);

      if (!user) return res.status(401).json({ success: false });

      if (Number(user.status) !== 1)
        return res.status(403).json({ success: false });

      const newAccessToken = jwt.sign(
        { user_id: user.user_id, token_version: user.token_version },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: ACCESS_EXPIRES },
      );

      return res.json({ success: true, accessToken: newAccessToken });
    } catch {
      return res.status(401).json({ success: false });
    }
  }

  /* ======================================================
     UPDATE FCM TOKEN
  ====================================================== */
  async updateFcmToken(req, res) {
    try {
      const userId = req.user?.user_id;
      const { fcm_token } = req.body;

      if (!fcm_token) {
        return res.status(400).json({
          success: false,
          message: "FCM token required",
        });
      }

      await AuthModel.updateFcmToken(userId, fcm_token);

      return res.json({
        success: true,
        message: "FCM token updated",
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
      });
    }
  }

  /* ======================================================
     CHANGE PASSWORD
  ====================================================== */
  async changePassword(req, res) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters",
        });
      }

      const user = await AuthModel.getUserPassword(connection, userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);

      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);

      await AuthModel.updatePassword(connection, userId, hashedPassword);

      await connection.commit();

      return res.json({
        success: true,
        message: "Password changed successfully. Please login again.",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Change Password Error:", error);

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    } finally {
      connection.release();
    }
  }

  /* ======================================================
     LOGOUT USER
  ====================================================== */
  async logoutUser(req, res) {
    try {
      const userId = req.user?.user_id;

      await AuthModel.clearFcmToken(userId);

      return res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      console.error("Logout Error:", error);

      return res.status(500).json({
        success: false,
        message: "Something went wrong",
      });
    }
  }

  /* ======================================================
     FORGOT PASSWORD
  ====================================================== */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      const normalizedEmail = email.trim().toLowerCase();

      const user = await AuthModel.findByEmail(normalizedEmail);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Account not found",
        });
      }

      await AuthModel.deleteOTPByEmail(normalizedEmail);

      const otp = generateOTP();

      await AuthModel.storeActivationOTP(user.email, otp);

      await sendOtpMail({
        email: user.email,
        name: user.name,
        otp,
      });

      return res.json({
        success: true,
        message: "OTP sent successfully",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
      });
    }
  }

  async verifyForgotPasswordOTP(req, res) {
    try {
      const { email, otp } = req.body;

      const normalizedEmail = email.trim().toLowerCase();

      const attempt = await AuthModel.getOtpAttempts(normalizedEmail);

      if (attempt && attempt.attempt_count >= 5) {
        return res.status(429).json({
          success: false,
          message: "Too many OTP attempts. Try again later.",
        });
      }

      const otpRecord = await AuthModel.verifyOTP(normalizedEmail, otp);

      if (!otpRecord) {
        await AuthModel.incrementOtpAttempts(normalizedEmail);

        return res.status(400).json({
          success: false,
          message: "Invalid or expired OTP",
        });
      }

      await AuthModel.markOTPVerified(normalizedEmail);

      return res.json({
        success: true,
        message: "OTP verified successfully",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
      });
    }
  }

  async resetPassword(req, res) {
    const conn = await db.getConnection();

    try {
      const { email, newPassword } = req.body;

      const normalizedEmail = email.trim().toLowerCase();

      const otpVerified = await AuthModel.checkOTPVerified(normalizedEmail);

      if (!otpVerified) {
        return res.status(403).json({
          success: false,
          message: "OTP verification required",
        });
      }

      const user = await AuthModel.findByEmail(normalizedEmail);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters",
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);

      await conn.beginTransaction();

      await AuthModel.updatePassword(conn, user.user_id, hashedPassword);

      await AuthModel.deleteOTP(normalizedEmail, conn);

      await conn.commit();

      return res.json({
        success: true,
        message: "Password reset successfully",
      });
    } catch (error) {
      await conn.rollback();

      return res.status(500).json({
        success: false,
      });
    } finally {
      conn.release();
    }
  }

  /*====================================Address============================================*/

  // Get all countries
  async getCountries(req, res) {
    try {
      const countries = await AddressModel.getAllCountries();

      return res.json({
        success: true,
        data: countries,
      });
    } catch (error) {
      console.error("Get Countries Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch countries",
      });
    }
  }

  // Get all states
  async getStates(req, res) {
    try {
      const states = await AddressModel.getAllStates();

      return res.json({
        success: true,
        data: states,
      });
    } catch (error) {
      console.error("Get States Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch states",
      });
    }
  }

  // Get states by country ID
  async getStatesByCountry(req, res) {
    try {
      const { country_id } = req.params;

      if (!country_id) {
        return res.status(400).json({
          success: false,
          message: "Country ID is required",
        });
      }

      const states = await AddressModel.getStatesByCountry(country_id);

      return res.json({
        success: true,
        data: states,
      });
    } catch (error) {
      console.error("Get States Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch states",
      });
    }
  }

  // Add address
  async addAddress(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { address1, city, zipcode, is_default, ...rest } = req.body;

      // Required fields validation
      if (!address1 || !city || !zipcode) {
        return res.status(400).json({
          success: false,
          message: "Required address fields missing",
        });
      }

      //  Check if user already has any address
      const hasAddress = await AddressModel.hasAnyAddress(userId);

      let finalIsDefault = 0;

      //  If first address make it default
      if (!hasAddress) {
        finalIsDefault = 1;
      }
      // If not first and user explicitly sets default
      else if (Number(is_default) === 1) {
        finalIsDefault = 1;

        // Clear existing default first
        await AddressModel.clearDefault(userId);
      }

      const addressId = await AddressModel.addAddress({
        user_id: userId,
        address1,
        city,
        zipcode,
        is_default: finalIsDefault,
        ...rest,
      });

      return res.status(201).json({
        success: true,
        message: "Address added successfully",
        address_id: addressId,
      });
    } catch (error) {
      console.error("Add Address Error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Update address
  async updateAddress(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { address_id } = req.params;
      const data = req.body;

      // 1 Check specific address ownership
      const address = await AddressModel.getAddressById(address_id, userId);

      if (!address) {
        return res.status(404).json({
          success: false,
          message: "Address not found",
        });
      }

      // Normalize undefined → keep original value
      const normalizedData = {};

      for (const key in data) {
        if (data[key] !== undefined) {
          normalizedData[key] = data[key];
        }
      }

      // -------------------------------
      // DEFAULT ADDRESS LOGIC
      // -------------------------------

      // If user tries to REMOVE default from THIS address
      if (Number(normalizedData.is_default) === 0 && address.is_default === 1) {
        const defaultCount = await AddressModel.countDefault(userId);

        if (defaultCount === 1) {
          return res.status(400).json({
            success: false,
            message: "At least one address must be default",
          });
        }
      }

      // If user sets THIS address as default
      if (Number(normalizedData.is_default) === 1) {
        await AddressModel.clearDefault(userId);
      }

      const updated = await AddressModel.updateAddress(
        address_id,
        userId,
        normalizedData,
      );

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Address not found",
        });
      }

      return res.json({
        success: true,
        message: "Address updated successfully",
      });
    } catch (error) {
      console.error("Update Address Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update address",
      });
    }
  }

  // Delete address
  async deleteAddress(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { address_id } = req.params;

      const deleted = await AddressModel.deleteAddress(address_id, userId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Address not found",
        });
      }

      return res.json({
        success: true,
        message: "Address deleted successfully",
      });
    } catch (error) {
      console.error("Delete Address Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to delete address",
      });
    }
  }

  // Fetch all addresses of the user
  async getMyAddresses(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const addresses = await AddressModel.getAddressesByUser(userId);

      return res.json({
        success: true,
        data: addresses,
      });
    } catch (error) {
      console.error("Fetch Addresses Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch addresses",
      });
    }
  }

  // Fetch address by ID
  async getAddressById(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { address_id } = req.params;

      const address = await AddressModel.getAddressById(address_id, userId);

      if (!address) {
        return res.status(404).json({
          success: false,
          message: "Address not found",
        });
      }

      return res.json({
        success: true,
        data: address,
      });
    } catch (error) {
      console.error("Get Address Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch address",
      });
    }
  }

  // Get user Info
  async getUserInfo(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const randomThought =
        thoughts[Math.floor(Math.random() * thoughts.length)];

      const [userInfo, todaySummary] = await Promise.all([
        AuthModel.getUserInfo(userId),
        FitnessService.getTodaySummary(userId),
      ]);

      if (!userInfo) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      return res.json({
        success: true,
        data: {
          ...userInfo,
          steps: {
            steps: todaySummary?.steps || 0,
            goal_steps: todaySummary?.goal_steps || 0,
            progress_percent: todaySummary?.progress_percent || 0,
          },
          thought: randomThought,
        },
      });
    } catch (error) {
      console.error("Get User Info Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch user info",
      });
    }
  }

  // Delete customer account
  async deleteCustomer(req, res) {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      await AuthModel.deleteCustomerAccount(userId);

      return res.json({
        success: true,
        message: "Account deleted successfully",
      });
    } catch (error) {
      console.error("Delete Account Error:", error);

      return res.status(500).json({
        success: false,
        message: "Something went wrong",
      });
    }
  }
}

module.exports = new AuthController();
