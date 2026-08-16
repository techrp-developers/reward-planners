  const AuthModel = require("../models/authModel");
  const db = require("../../../config/database");
  const fs = require("fs");
  const path = require("path");
  const AddressModel = require("../models/addressModel");
  const WalletModel = require("../../common/models/walletModel");
  const FitnessService = require("../../step-counter/v1/service/fitnessService");
  const bcrypt = require("bcryptjs");
  const crypto = require("crypto");
  const {
    issueCustomerSession,
    rotateCustomerSession,
    revokeCustomerSession,
  } = require("../utils/customerAuthSession");
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
const { notifyUser } = require("../utils/notification");
const { uploadToR2 } = require("../../../utils/r2upload");
const { deleteFromR2 } = require("../../../utils/r2delete");
const { getPublicUrl } = require("../../../utils/publicUrl");
const { FIRST_LOGIN_REWARD_COINS } = require("../constants/rewards");

  function generateOTP() {
    return crypto.randomInt(100000, 1000000).toString();
  }

  function normalizeEmail(email) {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
  }

  function normalizePhone(phone) {
    return typeof phone === "string" || typeof phone === "number"
      ? String(phone).trim()
      : "";
  }

  function getActivationIdentity(body = {}) {
    const rawLogin = [body.login, body.email, body.phone, body.mobile, body.contact].find(
      (value) => value !== undefined && value !== null && String(value).trim(),
    );
    const normalizedLogin =
      typeof rawLogin === "string" || typeof rawLogin === "number"
        ? String(rawLogin).trim()
        : "";
    const email = normalizedLogin.includes("@") ? normalizeEmail(normalizedLogin) : "";
    const phone = normalizedLogin && !email ? normalizePhone(normalizedLogin) : "";

    return {
      email,
      phone,
      otpKey: email || phone,
    };
  }

  async function findEmployeeForActivation({ email, phone }) {
    if (email) return AuthModel.findEmployeeByEmail(email);
    if (phone) return AuthModel.findEmployeeByPhone(phone);
    return null;
  }

  function sendActivationOtpNotifications({ email, employee, otp }) {
    setImmediate(() => {
      if (email) {
        sendOtpMail({
          email,
          name: employee.name,
          otp,
        }).catch((error) => {
          console.error("Activation OTP email failed:", error);
        });
      }

      // Send to the channel the employee selected on the login screen.
      if (email || !employee.phone) return;

      enqueueWhatsApp({
        eventName: "onbord_verify",
        ctx: {
          phone: employee.phone,
          company_id: employee.company_id ?? null,
          customer_name: employee.name || "User",
          otp,
        },
      })
        .then((result) => {
          if (!result.ok) {
            console.warn("Activation OTP WhatsApp not queued:", result);
          }
        })
        .catch((error) => {
          console.error("Activation OTP WhatsApp enqueue failed:", error);
        });
    });
  }

  function sendForgotPasswordOtpNotifications({ email, user, otp }) {
    setImmediate(() => {
      if (email) {
        sendOtpMail({
          email,
          name: user.name,
          otp,
        }).catch((error) => {
          console.error("Forgot password OTP email failed:", error);
        });
      }

      if (!user.phone) return;

      enqueueWhatsApp({
        eventName: "onbord_forgot_pass",
        ctx: {
          phone: user.phone,
          company_id: user.company_id ?? null,
          customer_name: user.name || "User",
          otp,
        },
      })
        .then((result) => {
          if (!result.ok) {
            console.warn("Forgot password OTP WhatsApp not queued:", result);
          }
        })
        .catch((error) => {
          console.error(
            "Forgot password OTP WhatsApp enqueue failed:",
            error,
          );
        });
    });
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
      try {
        const identity = getActivationIdentity(req.body);
        if (!identity.otpKey) {
          return res.status(400).json({
            success: false,
            message: "Email or phone is required",
          });
        }

        const employee = await findEmployeeForActivation(identity);

        if (!employee) {
          return res.json({
            success: true,
            message: "If your employee account is eligible, a code has been sent.",
          });
        }

        await AuthModel.deleteOTPByEmail(identity.otpKey);

        const otp = generateOTP();

        await AuthModel.storeActivationOTP(identity.otpKey, otp);

        sendActivationOtpNotifications({
          email: identity.email,
          employee,
          otp,
        });

        return res.json({
          success: true,
          message: "If your employee account is eligible, a code has been sent.",
        });
      } catch (error) {
        console.error("Activate account error:", error);
        return res.status(500).json({ success: false });
      }
    }

    /* ======================================================
      RESEND ACTIVATION OTP
    ====================================================== */
    async resendActivationOTP(req, res) {
      try {
        const identity = getActivationIdentity(req.body);
        if (!identity.otpKey) {
          return res.status(400).json({
            success: false,
            message: "Email or phone is required",
          });
        }

        const employee = await findEmployeeForActivation(identity);

        if (!employee) {
          return res.json({
            success: true,
            message: "If your employee account is eligible, a code has been sent.",
          });
        }

        await AuthModel.deleteOTPByEmail(identity.otpKey);

        const otp = generateOTP();

        await AuthModel.storeActivationOTP(identity.otpKey, otp);

        sendActivationOtpNotifications({
          email: identity.email,
          employee,
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
      const conn = await db.getConnection();
      try {
        const { otp } = req.body;
        const identity = getActivationIdentity(req.body);

        if (!identity.otpKey || !otp) {
          return res.status(400).json({
            success: false,
            message: "Email or phone, and OTP are required",
          });
        }

        const attempt = await AuthModel.getOtpAttempts(identity.otpKey);

        if (attempt && attempt.attempt_count >= 5) {
          return res.status(429).json({
            success: false,
            message: "Too many OTP attempts. Try again later.",
          });
        }

        const otpRecord = await AuthModel.verifyOTP(identity.otpKey, otp);

        if (!otpRecord) {
          await AuthModel.incrementOtpAttempts(identity.otpKey);

          return res.status(400).json({
            success: false,
            message: "Invalid or expired OTP",
          });
        }

        const employee = await findEmployeeForActivation(identity);
        if (!employee) {
          return res.status(401).json({
            success: false,
            message: "Invalid or expired OTP",
          });
        }

        const existingCustomer = await AuthModel.findByCompanyUserId(employee.id);
        if (existingCustomer && Number(existingCustomer.status) !== 1) {
          // A verified OTP is already proof of ownership, so a soft-deleted
          // account still inside its 30-day grace period can be reactivated
          // here rather than blocked.
          const reactivated = await AuthModel.reactivateIfWithinGracePeriod(
            existingCustomer.user_id,
            existingCustomer.deleted_at,
          );

          if (!reactivated) {
            return res.status(403).json({
              success: false,
              message: "Account inactive",
            });
          }
        }

        // Keep the legacy password column populated with an unusable random value.
        // Password login is not required for OTP-created accounts.
        const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);

        await conn.beginTransaction();
        const user = await AuthModel.findOrCreateCustomerForEmployee(
          employee,
          unusablePassword,
          conn,
        );
        await AuthModel.deleteOTP(identity.otpKey, conn);
        await conn.commit();

        const tokens = await issueCustomerSession(user.user_id, req, res);
        await AuthModel.updateLoginMeta(user.user_id, req.ip);
        const firstLoginBonus = await WalletModel.createWalletOnFirstLogin(user.user_id);

        if (firstLoginBonus) {
          notifyUser(
            {
              userId: user.user_id,
              module: "wallet",
              type: "first_login_reward",
              title: "Coins credited",
              message: `You received ${FIRST_LOGIN_REWARD_COINS} reward coins for your first login.`,
              icon: "wallet",
              reference_type: "wallet",
              reference_id: user.user_id,
              action_url: "/wallet",
              metadata: { coins: FIRST_LOGIN_REWARD_COINS },
            },
            "first login reward notification",
          );

          setImmediate(() => {
            if (employee.email) {
              rewardCreditMail({
                email: employee.email,
                name: employee.name,
                coins: FIRST_LOGIN_REWARD_COINS,
              }).catch((error) => console.error("First login reward email failed:", error));
            }

            if (employee.phone) {
              enqueueWhatsApp({
                eventName: "wallet_credit_first_login",
                ctx: {
                  phone: employee.phone,
                  company_id: employee.company_id,
                  customer_name: employee.name || "User",
                  coins: FIRST_LOGIN_REWARD_COINS,
                },
              }).catch((error) => console.error("First login reward WhatsApp failed:", error));
            }
          });
        }

        if (user.created) {
          notifyUser(
            {
              userId: user.user_id,
              module: "common",
              type: "account_activated",
              title: "Account activated",
              message: "Your RewardPlanners account is ready to use.",
              icon: "user-check",
              reference_type: "account",
              reference_id: user.user_id,
              action_url: "/profile",
            },
            "account activation notification",
          );

          if (employee.email) {
            setImmediate(() => {
              accountCreationSuccessMail({
                name: employee.name,
                email: employee.email,
              }).catch((error) => console.error("Email send failed:", error));
            });
          }

          if (employee.phone) {
            setImmediate(() => {
              enqueueWhatsApp({
                eventName: "create_account_notification",
                ctx: {
                  phone: employee.phone,
                  company_id: employee.company_id ?? null,
                  customer_name: employee.name || "User",
                },
              }).catch((error) => console.error("WhatsApp enqueue failed:", error));
            });
          }
        }

        return res.json({
          success: true,
          message: user.created
            ? "Account activated and login successful"
            : "Login successful",
          user: {
            userId: user.user_id,
            name: employee.name,
            email: employee.email,
            phone: employee.phone,
          },
          ...tokens,
          firstLoginReward: {
            awarded: firstLoginBonus,
            coins: firstLoginBonus ? FIRST_LOGIN_REWARD_COINS : 0,
          },
        });
      } catch (err) {
        try {
          await conn.rollback();
        } catch {}
        console.error("Verify activation OTP error:", err);

        return res.status(500).json({
          success: false,
          message: "Server error",
        });
      } finally {
        conn.release();
      }
    }

    /* ======================================================
      SET PASSWORD
    ====================================================== */
    async setPassword(req, res) {
      const conn = await db.getConnection();
      try {
        const { password } = req.body;
        const identity = getActivationIdentity(req.body);

        if (!identity.otpKey || !password) {
          return res.status(400).json({
            success: false,
            message: "Email or phone, and password are required",
          });
        }

        if (password.length < 8) {
          return res.status(400).json({
            success: false,
            message: "Password must be at least 8 characters",
          });
        }

        const existing = await AuthModel.findByEmailOrPhone(identity);

        if (existing) {
          return res.status(400).json({
            success: false,
            message: "Account already exists",
          });
        }

        const otpVerified = await AuthModel.checkOTPVerified(identity.otpKey);

        if (!otpVerified) {
          return res.status(403).json({
            success: false,
            message: "OTP verification required",
          });
        }

        const employee = await findEmployeeForActivation(identity);

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

        await AuthModel.deleteOTP(identity.otpKey, conn);

        await conn.commit();

        const createdUser = await AuthModel.findByEmailOrPhone({
          email: normalizeEmail(employee.email),
          phone: normalizePhone(employee.phone),
        });

        notifyUser(
          {
            userId: createdUser?.user_id,
            module: "common",
            type: "account_activated",
            title: "Account activated",
            message: "Your RewardPlanners account is ready to use.",
            icon: "user-check",
            reference_type: "account",
            reference_id: createdUser?.user_id,
            action_url: "/profile",
          },
          "account activation notification",
        );

        if (employee.email) {
          setImmediate(() => {
            accountCreationSuccessMail({
              name: employee.name,
              email: employee.email,
            }).catch((err) => {
              console.error("Email send failed:", err);
            });
          });
        }

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
        const { email, phone, login, password } = req.body;
        if (!password) {
          return AuthController.prototype.activateAccount(req, res);
        }
        const loginIdentifier = email ?? phone ?? login;
        const rawIdentifier =
          typeof loginIdentifier === "string" ||
          typeof loginIdentifier === "number"
            ? String(loginIdentifier).trim()
            : "";
        const isEmailLogin = rawIdentifier.includes("@");
        const normalizedEmail = isEmailLogin ? normalizeEmail(rawIdentifier) : "";
        const normalizedPhone = isEmailLogin ? "" : normalizePhone(rawIdentifier);

        if (!rawIdentifier || !password) {
          return res.status(400).json({
            success: false,
            message: "Email/phone and password are required",
          });
        }

        const user = await AuthModel.findByEmailOrPhone({
          email: normalizedEmail,
          phone: normalizedPhone,
        });
        if (!user) return res.status(401).json({ success: false });

        // Verify credentials before acting on account status: reactivating a
        // soft-deleted account must require proof of ownership, not just a
        // known email/phone.
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ success: false });

        if (Number(user.status) !== 1) {
          const reactivated = await AuthModel.reactivateIfWithinGracePeriod(
            user.user_id,
            user.deleted_at,
          );

          if (!reactivated)
            return res
              .status(403)
              .json({ success: false, message: "Account inactive" });

          user.status = 1;
        }

        if (!user.is_verified)
          return res
            .status(403)
            .json({ success: false, message: "Email not verified" });

        const employee = user.company_user_id
          ? await AuthModel.findEmployeeById(user.company_user_id)
          : await AuthModel.findEmployeeByEmail(user.email);

        if (!employee) {
          return res.status(404).json({
            success: false,
            message: "Employee not found",
          });
        }
        // const tokenVersion = Number(user.token_version || 0);
        const { accessToken, refreshToken } = await issueCustomerSession(
          user.user_id,
          req,
          res,
        );

        await AuthModel.updateLoginMeta(user.user_id, req.ip);

        const firstLoginBonus = await WalletModel.createWalletOnFirstLogin(
          user.user_id,
        );

        if (firstLoginBonus) {
          notifyUser(
            {
              userId: user.user_id,
              module: "wallet",
              type: "first_login_reward",
              title: "Coins credited",
              message: `You received ${FIRST_LOGIN_REWARD_COINS} reward coins for your first login.`,
              icon: "wallet",
              reference_type: "wallet",
              reference_id: user.user_id,
              action_url: "/wallet",
              metadata: { coins: FIRST_LOGIN_REWARD_COINS },
            },
            "first login reward notification",
          );

          setImmediate(() => {
            rewardCreditMail({
              email: user.email,
              name: user.name,
              coins: FIRST_LOGIN_REWARD_COINS,
            }).catch((err) => {
              console.error("First login reward email failed:", err);
            });

            enqueueWhatsApp({
              eventName: "wallet_credit_first_login",
              ctx: {
                phone: employee.phone,
                company_id: employee.company_id,
                customer_name: employee.name || "User",
                coins: FIRST_LOGIN_REWARD_COINS,
              },
            }).catch((err) => {
              console.error("First login reward WhatsApp failed:", err);
            });
          });
        }

        return res.json({
          success: true,
          accessToken,
          refreshToken,
          firstLoginReward: {
            awarded: firstLoginBonus,
            coins: firstLoginBonus ? FIRST_LOGIN_REWARD_COINS : 0,
          },
        });
      } catch (err) {
        return res.status(500).json({ success: false });
      }
    }

    // Refresh
    async refreshAccessToken(req, res) {
      try {
        const tokens = await rotateCustomerSession(req, res);
        if (!tokens) return res.status(401).json({ success: false });
        return res.json({ success: true, ...tokens });
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
        const { fcm_token, device_platform } = req.body;

        if (!fcm_token) {
          return res.status(400).json({
            success: false,
            message: "FCM token required",
          });
        }

        const normalizedPlatform = String(device_platform || "").toLowerCase();
        if (normalizedPlatform && !["android", "ios"].includes(normalizedPlatform)) {
          return res.status(400).json({
            success: false,
            message: "device_platform must be android or ios",
          });
        }

        await AuthModel.updateFcmToken(userId, fcm_token, normalizedPlatform || null);

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

        await connection.beginTransaction();
        await AuthModel.updatePassword(connection, userId, hashedPassword);

        await connection.commit();

        notifyUser(
          {
            userId,
            module: "common",
            type: "password_changed",
            title: "Password changed",
            message: "Your account password was changed successfully.",
            icon: "lock",
            reference_type: "account",
            reference_id: userId,
            action_url: "/profile/security",
            priority: "high",
          },
          "password changed notification",
        );

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
        await revokeCustomerSession(req, res);
        if (userId) await AuthModel.clearFcmToken(userId);

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

        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail) {
          return res.status(400).json({
            success: false,
            message: "Email is required",
          });
        }

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

        sendForgotPasswordOtpNotifications({
          email: user.email,
          user,
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

    /* ======================================================
      RESEND OTP
    ====================================================== */
    async resendOTP(req, res) {
      try {
        const { email } = req.body;

        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail) {
          return res.status(400).json({
            success: false,
            message: "Email is required",
          });
        }

        const employee = await AuthModel.findEmployeeByEmail(normalizedEmail);

        if (!employee) {
          return res.status(404).json({
            success: false,
            message: "Employee not found",
          });
        }

        const existing = await AuthModel.findByCompanyUserId(employee.id);

        if (!existing) {
          return res.status(400).json({
            success: false,
            message: "User doesn't exist.Please activate the account",
          });
        }

        await AuthModel.deleteOTPByEmail(normalizedEmail);

        const otp = generateOTP();

        await AuthModel.storeActivationOTP(normalizedEmail, otp);

        sendForgotPasswordOtpNotifications({
          email: normalizedEmail,
          user: employee,
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

    async verifyForgotPasswordOTP(req, res) {
      try {
        const { email, otp } = req.body;

        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail || !otp) {
          return res.status(400).json({
            success: false,
            message: "Email and OTP are required",
          });
        }

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

        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail) {
          return res.status(400).json({
            success: false,
            message: "Email is required",
          });
        }

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

        notifyUser(
          {
            userId: user.user_id,
            module: "common",
            type: "password_reset",
            title: "Password reset",
            message: "Your password was reset successfully.",
            icon: "lock",
            reference_type: "account",
            reference_id: user.user_id,
            action_url: "/profile/security",
            priority: "high",
          },
          "password reset notification",
        );

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
      const conn = await db.getConnection();
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
        await conn.beginTransaction();

        const hasAddress = await AddressModel.hasAnyAddress(userId, conn);

        let finalIsDefault = 0;

        //  If first address make it default
        if (!hasAddress) {
          finalIsDefault = 1;
        }
        // If not first and user explicitly sets default
        else if (Number(is_default) === 1) {
          finalIsDefault = 1;

          // Clear existing default first
          await AddressModel.clearDefault(userId, conn);
        }

        const addressId = await AddressModel.addAddress(
          {
            user_id: userId,
            address1,
            city,
            zipcode,
            is_default: finalIsDefault,
            ...rest,
          },
          conn,
        );

        await conn.commit();

        notifyUser(
          {
            userId,
            module: "common",
            type: "address_added",
            title: "Address added",
            message: "A new address was added to your account.",
            icon: "map-pin",
            reference_type: "address",
            reference_id: addressId,
            action_url: "/profile/addresses",
          },
          "address added notification",
        );

        return res.status(201).json({
          success: true,
          message: "Address added successfully",
          address_id: addressId,
        });
      } catch (error) {
        await conn.rollback();
        console.error("Add Address Error:", error);
        return res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      } finally {
        conn.release();
      }
    }

    // Update address
    async updateAddress(req, res) {
      const conn = await db.getConnection();
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

        await conn.beginTransaction();

        // 1 Check specific address ownership
        const address = await AddressModel.getAddressById(
          address_id,
          userId,
          conn,
        );

        if (!address) {
          await conn.rollback();
          return res.status(404).json({
            success: false,
            message: "Address not found",
          });
        }

        // Normalize undefined → keep original value
        const fields = [
          "address_type",
          "is_default",
          "address1",
          "address2",
          "city",
          "zipcode",
          "state_id",
          "landmark",
          "contact_name",
          "contact_phone",
          "latitude",
          "longitude",
        ];

        const normalizedData = {};
        for (const field of fields) {
          normalizedData[field] =
            data[field] !== undefined ? data[field] : address[field];
        }

        // -------------------------------
        // DEFAULT ADDRESS LOGIC
        // -------------------------------

        // If user tries to REMOVE default from THIS address
        if (Number(normalizedData.is_default) === 0 && address.is_default === 1) {
          const defaultCount = await AddressModel.countDefault(userId, conn);

          if (defaultCount === 1) {
            await conn.rollback();
            return res.status(400).json({
              success: false,
              message: "At least one address must be default",
            });
          }
        }

        // If user sets THIS address as default
        if (Number(normalizedData.is_default) === 1) {
          await AddressModel.clearDefault(userId, conn);
        }

        const updated = await AddressModel.updateAddress(
          address_id,
          userId,
          normalizedData,
          conn,
        );

        if (!updated) {
          await conn.rollback();
          return res.status(404).json({
            success: false,
            message: "Address not found",
          });
        }

        await conn.commit();

        notifyUser(
          {
            userId,
            module: "common",
            type: "address_updated",
            title: "Address updated",
            message: "Your address was updated successfully.",
            icon: "map-pin",
            reference_type: "address",
            reference_id: address_id,
            action_url: "/profile/addresses",
          },
          "address updated notification",
        );

        return res.json({
          success: true,
          message: "Address updated successfully",
        });
      } catch (error) {
        await conn.rollback();
        console.error("Update Address Error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update address",
        });
      } finally {
        conn.release();
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

        notifyUser(
          {
            userId,
            module: "common",
            type: "address_deleted",
            title: "Address deleted",
            message: "An address was removed from your account.",
            icon: "map-pin",
            reference_type: "address",
            reference_id: address_id,
            action_url: "/profile/addresses",
          },
          "address deleted notification",
        );

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
        res.set("Cache-Control", "no-store");

        const userId = req.user?.user_id;

        if (!userId) {
          return res.status(401).json({
            success: false,
            message: "Unauthorized user",
          });
        }

        const randomThought =
          thoughts[Math.floor(Math.random() * thoughts.length)];

        const [userInfo, todaySummary, birthdayEmployees] = await Promise.all([
          AuthModel.getUserInfo(userId),
          FitnessService.getTodaySummary(userId),
          AuthModel.getTodayBirthdayEmployees(userId),
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
            birthday_employees: birthdayEmployees || [],
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

    // Update profile
    async updateProfile(req, res) {
      const connection = await db.getConnection();

      try {
        await connection.beginTransaction();

        const userId = req.user?.user_id;

        if (!userId) {
          return res.status(401).json({
            success: false,
            message: "Unauthorized user",
          });
        }

        const existingUser = await AuthModel.getProfile(connection, userId);

        if (!existingUser) {
          await connection.rollback();
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        let imagePath = existingUser.user_image;

        if (req.file) {
          if (!req.file.mimetype.startsWith("image/")) {
            await connection.rollback();
            return res.status(400).json({
              success: false,
              message: "Invalid image file",
            });
          }

          const fileBuffer = fs.readFileSync(req.file.path);

          const extension = path.extname(req.file.originalname);

          const filename = `profile-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 8)}${extension}`;

          imagePath = `public/customers/${userId}/${filename}`;

          await uploadToR2(fileBuffer, imagePath, req.file.mimetype);

          // delete old image
          if (existingUser.user_image) {
            try {
              await deleteFromR2(existingUser.user_image);
            } catch (err) {
              console.error("OLD PROFILE IMAGE DELETE ERROR:", err);
            }
          }

          fs.unlinkSync(req.file.path);
        }

        const updatedData = {
          phone: req.body.phone ?? existingUser.phone,
          user_image: imagePath,
        };

        await AuthModel.updateProfile(connection, userId, updatedData);

        await connection.commit();

        notifyUser(
          {
            userId,
            module: "common",
            type: "profile_updated",
            title: "Profile updated",
            message: "Your profile details were updated.",
            icon: "user",
            reference_type: "profile",
            reference_id: userId,
            action_url: "/profile",
          },
          "profile updated notification",
        );

        return res.status(200).json({
          success: true,
          message: "Profile updated successfully",
          data: {
            phone: updatedData.phone,
            user_image: getPublicUrl(updatedData.user_image, new Date()),
          },
        });
      } catch (error) {
        await connection.rollback();

        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        console.error("UPDATE PROFILE ERROR:", error);

        return res.status(500).json({
          success: false,
          message: error.message,
        });
      } finally {
        connection.release();
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
