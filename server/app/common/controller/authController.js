const AuthModel = require("../models/authModel");
const db = require("../../../config/database");
const AddressModel = require("../models/addressModel");
const WalletModel = require("../../common/models/walletModel");
const FitnessService = require("../../step-counter/v1/service/fitnessService");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const {
  sendVerificationMail,
} = require("../../../services/mailBuilder/userVerification");
const {
  sendNewDeviceLoginEmail,
} = require("../../../services/mailBuilder/deviceNotification");
const {
  accountCreationSuccessMail,
} = require("../../../services/mailBuilder/accountCreation");
const { rewardCreditMail } = require("../../../services/mailBuilder/firstTimeReward");
const { sendOtpMail } = require("../../../services/mailBuilder/sendOtp");
const {
  enqueueWhatsApp,
} = require("../../../services/whatsapp/waEnqueueService");

// sakshi edits
const {
  sendDeviceChangeApprovalMail,
} = require("../../../services/mailBuilder/deviceChangeApproval");
const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES_DAYS = 7;

function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

class AuthController {
  /* ======================================================
     REGISTER
  ====================================================== */
  async registerUser(req, res) {
    try {
      const { name, email, phone, password, cpassword } = req.body;

      if (!name || !email || !password || !cpassword)
        return res
          .status(400)
          .json({ success: false, message: "Please fill all fields" });

      if (password !== cpassword) {
        return res
          .status(400)
          .json({ success: false, message: "Passwords do not match" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const existing = await AuthModel.findByEmail(normalizedEmail);
      if (existing)
        return res
          .status(409)
          .json({ success: false, message: "Email already registered" });

      if (password.length < 8)
        return res
          .status(400)
          .json({ success: false, message: "Password too weak" });

      const hashedPassword = await bcrypt.hash(password, 12);

      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = await bcrypt.hash(rawToken, 10);

      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const userId = await AuthModel.createCustomer({
        name,
        email: normalizedEmail,
        phone,
        password: hashedPassword,
        verification_token: hashedToken,
        verification_token_expiry: expiry,
      });

      // Send email with rawToken
      const token = `${process.env.BACKEND_URL}/api/crm/v1/auth/verify-email?token=${rawToken}`;
      await sendVerificationMail({
        name,
        email: normalizedEmail,
        token,
      });

      return res.status(201).json({
        success: true,
        message: "Registration successful. Please verify email.",
      });
    } catch (err) {
      return res.status(500).json({ success: false });
    }
  }

  /* ======================================================
     ACTIVATE ACCOUNT
  ====================================================== */
  async activateAccount(req, res) {
    const { email } = req.body;

    const employee = await AuthModel.findEmployeeByEmail(email);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // const existingAccount = await AuthModel.findByEmail(email);
    const existingAccount = await AuthModel.findByCompanyUserId(employee.id);

    if (existingAccount) {
      return res.status(400).json({
        success: false,
        message: "Account already activated",
      });
    }

    const otp = generateOTP();

    await AuthModel.storeActivationOTP(email, otp);

    await sendOtpMail({
      email,
      name: employee.name,
      otp,
    });

    return res.json({
      success: true,
      message: "OTP sent to email",
    });
  }

  /* ======================================================
   VERIFY OTP
====================================================== */
  async verifyActivationOTP(req, res) {
    try {
      const { email, otp, device_name } = req.body;

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

      const finalDeviceName = device_name
        ? device_name.toLowerCase()
        : "unknown";

      const deviceId = await AuthModel.saveVerifiedDevice(
        normalizedEmail,
        finalDeviceName,
      );

      return res.json({
        success: true,
        message: "OTP verified successfully",
        device_id: deviceId,
        device_name: finalDeviceName,
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
     VERIFY EMAIL
  ====================================================== */
  async verifyEmail(req, res) {
    try {
      const { token } = req.query;

      if (!token) {
        return res.status(400).send("Invalid verification link.");
      }

      const users = await AuthModel.findByVerificationToken();

      for (const user of users) {
        const isMatch = await bcrypt.compare(token, user.verification_token);

        if (
          isMatch &&
          user.verification_token_expiry &&
          new Date() < new Date(user.verification_token_expiry)
        ) {
          await AuthModel.markEmailVerified(user.user_id);
          return res.send(`
          <html>
            <head>
              <title>Email Verified</title>
            </head>

            <body style="font-family: Arial, sans-serif; background:#f6f6f6; margin:0; padding:0;">
              
              <div style="max-width:600px;margin:60px auto;background:#ffffff;padding:40px;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
                
                <h2 style="margin-bottom:10px;">Email verified successfully 🎉</h2>

                <p style="font-size:16px;color:#333;">
                  Hi ${user.name},
                </p>

                <p style="font-size:15px;color:#555;line-height:1.6;">
                  Welcome to <b>RewardPlanners</b>! Your account has been successfully created and is now ready to use.
                  <br><br>
                  You can now start earning and redeeming rewards, explore exclusive benefits, and make smarter financial decisions — all from one platform.
                </p>

                <p style="font-size:15px;color:#555;margin-top:20px;">
                  Log in to your account and begin your RewardPlanners journey today.
                </p>

                <div style="margin:30px 0;">
                  <a href="rewardplanners://login"
                    style="padding:14px 28px;background:#000;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
                    Open RewardPlanners App
                  </a>
                </div>

                <p style="font-size:14px;color:#777;">
                  Warm regards,<br>
                  <b>Team RewardPlanners</b>
                </p>

              </div>

              <script>
                // Try opening app via custom scheme
                setTimeout(function() {
                  window.location.href = "rewardplanners://login";
                }, 500);

                // Android Chrome fallback
                setTimeout(function() {
                  window.location.href = "intent://login#Intent;scheme=rewardplanners;package=com.rewardsplanners;end";
                }, 1500);
              </script>

            </body>
          </html>
          `);
        }
      }

      return res.status(400).send(`
      <html>
        <body style="font-family:sans-serif;text-align:center;margin-top:50px;">
          <h2>Invalid or expired verification link </h2>
          <p>Please request a new verification email.</p>
        </body>
      </html>
    `);
    } catch (error) {
      return res.status(500).send("Internal server error");
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
        { user_id: user.user_id, token_version: user.token_version },
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
      // check existing device
      const deviceInfo = req.headers["user-agent"];
      const ipAddress = req.ip;

      // check if device already exists
      const existingDevice = await AuthModel.checkExistingDevice(
        user.user_id,
        deviceInfo,
      );

      if (!existingDevice) {
        await sendNewDeviceLoginEmail({
          email: user.email,
          name: user.name,
          ip: ipAddress,
          device: deviceInfo,
        });
      }

      await AuthModel.storeRefreshToken(
        user.user_id,
        refreshToken,
        expiryDate,
        deviceInfo,
        ipAddress,
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

  /* ======================================================
   LOGIN  // sakshi edits
====================================================== */

  // async loginUser(req, res) {
  //   try {
  //     const { email, password, fcm_token, device_id, device_name } = req.body;

  //     if (!email || !password) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Email and password are required",
  //       });
  //     }

  //     const normalizedEmail = email.trim().toLowerCase();

  //     const user = await AuthModel.findByEmail(normalizedEmail);

  //     if (!user) {
  //       return res.status(401).json({
  //         success: false,
  //       });
  //     }

  //     if (Number(user.status) !== 1) {
  //       return res.status(403).json({
  //         success: false,
  //         message: "Account inactive",
  //       });
  //     }

  //     if (!user.is_verified) {
  //       return res.status(403).json({
  //         success: false,
  //         message: "Email not verified",
  //       });
  //     }

  //     const employee = await AuthModel.findEmployeeByEmail(normalizedEmail);

  //     if (!employee) {
  //       return res.status(404).json({
  //         success: false,
  //         message: "Employee not found",
  //       });
  //     }

  //     const match = await bcrypt.compare(password, user.password);

  //     if (!match) {
  //       return res.status(401).json({
  //         success: false,
  //         message: "Invalid email or password",
  //       });
  //     }

  //     if (!device_id) {
  //       return res.status(400).json({
  //         success: false,
  //         message: "Device ID is required",
  //       });
  //     }

  //     const currentDeviceId = device_id.toString();
  //     const currentDeviceName = device_name
  //       ? device_name.toString().toLowerCase()
  //       : "unknown";

  //     const ipAddress = req.ip;
  //     const userAgent = req.headers["user-agent"] || "Unknown";

  //     if (!user.device_id) {
  //       await AuthModel.updateCustomerDevice({
  //         userId: user.user_id,
  //         deviceId: currentDeviceId,
  //         deviceName: currentDeviceName,
  //         fcm_token,
  //         ipAddress,
  //       });

  //       user.device_id = currentDeviceId;
  //       user.device_name = currentDeviceName;
  //     }

  //     if (user.device_id && user.device_id !== currentDeviceId) {
  //       const approvalToken = crypto.randomBytes(32).toString("hex");
  //       const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  //       await AuthModel.deletePendingDeviceRequests(user.user_id);

  //       await AuthModel.createDeviceChangeRequest({
  //         userId: user.user_id,
  //         email: user.email,
  //         oldDeviceId: user.device_id,
  //         newDeviceId: currentDeviceId,
  //         newDeviceName: currentDeviceName,
  //         token: approvalToken,
  //         ipAddress,
  //         fcmToken: fcm_token,
  //         userAgent,
  //         expiresAt,
  //       });

  //       await sendDeviceChangeApprovalMail({
  //         email: user.email,
  //         name: user.name,
  //         deviceName: currentDeviceName,
  //         ipAddress,
  //         userAgent,
  //         token: approvalToken,
  //       });

  //       return res.status(403).json({
  //         success: false,
  //         device_verification_required: true,
  //         message:
  //           "New device detected. Approval email has been sent to your registered email.",
  //       });
  //     }

  //     const accessToken = jwt.sign(
  //       {
  //         user_id: user.user_id,
  //         token_version: user.token_version,
  //       },
  //       process.env.ACCESS_TOKEN_SECRET,
  //       {
  //         expiresIn: ACCESS_EXPIRES,
  //       },
  //     );

  //     const refreshToken = jwt.sign(
  //       {
  //         user_id: user.user_id,
  //       },
  //       process.env.REFRESH_TOKEN_SECRET,
  //       {
  //         expiresIn: `${REFRESH_EXPIRES_DAYS}d`,
  //       },
  //     );

  //     const expiryDate = new Date(
  //       Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  //     );

  //     await AuthModel.storeRefreshToken(
  //       user.user_id,
  //       refreshToken,
  //       expiryDate,
  //       userAgent,
  //       ipAddress,
  //     );

  //     await AuthModel.updateLoginMeta(user.user_id, ipAddress);

  //     const firstLoginBonus = await WalletModel.createWalletOnFirstLogin(
  //       user.user_id,
  //     );

  //     if (firstLoginBonus) {
  //       await rewardCreditMail({
  //         email: user.email,
  //         name: user.name,
  //         coins: 3000,
  //       });

  //       // Send WhatsApp
  //       await enqueueWhatsApp({
  //         eventName: "wallet_credit_first_login",
  //         ctx: {
  //           phone: employee.phone,
  //           company_id: employee.company_id,
  //           customer_name: employee.name || "User",
  //           coins: 3000,
  //         },
  //       });
  //     }

  //     return res.json({
  //       success: true,
  //       message: "Login successful",
  //       accessToken,
  //       refreshToken,
  //       device_id: currentDeviceId,
  //       device_name: currentDeviceName,
  //       firstLoginReward: {
  //         awarded: firstLoginBonus,
  //         coins: firstLoginBonus ? 3000 : 0,
  //       },
  //     });
  //   } catch (err) {
  //     console.error("LOGIN ERROR:", err);

  //     return res.status(500).json({
  //       success: false,
  //       message: "Server error",
  //     });
  //   }
  // }

  /* ======================================================
   ALLOW DEVICE CHANGE
====================================================== */
  async allowDeviceChange(req, res) {
    try {
      const { token } = req.query;

      if (!token) {
        return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 60px;">
            <h2>Invalid Request</h2>
            <p>Device approval token is missing.</p>
          </body>
        </html>
      `);
      }

      const request = await AuthModel.getPendingDeviceRequest(token);

      if (!request) {
        return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 60px;">
            <h2>Invalid or Already Used Link</h2>
            <p>This device approval link is invalid or already used.</p>
          </body>
        </html>
      `);
      }

      if (new Date(request.expires_at) < new Date()) {
        await AuthModel.updateDeviceRequestStatus(token, "expired");

        return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 60px;">
            <h2>Link Expired</h2>
            <p>This device approval request has expired. Please try login again.</p>
          </body>
        </html>
      `);
      }

      await AuthModel.updateCustomerDevice({
        userId: request.user_id,
        deviceId: request.new_device_id,
        deviceName: request.new_device_name,
        fcm_token: request.fcm_token,
        ipAddress: request.ip_address,
      });

      await AuthModel.deleteUserRefreshTokensByUserId(request.user_id);

      await AuthModel.updateDeviceRequestStatus(token, "allowed");

      return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; background:#f6f6f6; margin:0; padding:0;">
          <div style="max-width:600px;margin:60px auto;background:#ffffff;padding:40px;border-radius:12px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
            <h2 style="color:#16a34a;">Device Allowed Successfully</h2>

            <p style="font-size:16px;color:#333;line-height:1.6;">
              Your new device has been verified successfully.
            </p>

            <p style="font-size:15px;color:#555;line-height:1.6;">
              Please open the app and login again from your new device.
            </p>

            <div style="margin:30px 0;">
              <a href="rewardplanners://login"
                style="padding:14px 28px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">
                Open RewardPlanners App
              </a>
            </div>
          </div>

          <script>
            setTimeout(function() {
              window.location.href = "rewardplanners://login";
            }, 500);

            setTimeout(function() {
              window.location.href = "intent://login#Intent;scheme=rewardplanners;package=com.rewardsplanners;end";
            }, 1500);
          </script>
        </body>
      </html>
    `);
    } catch (err) {
      console.error("ALLOW DEVICE ERROR:", err);

      return res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 60px;">
          <h2>Server Error</h2>
          <p>Something went wrong while approving the device.</p>
        </body>
      </html>
    `);
    }
  }
  /* ======================================================
   DENY DEVICE CHANGE
====================================================== */
  async denyDeviceChange(req, res) {
    try {
      const { token } = req.query;

      if (!token) {
        return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 60px;">
            <h2>Invalid Request</h2>
            <p>Device denial token is missing.</p>
          </body>
        </html>
      `);
      }

      const request = await AuthModel.getPendingDeviceRequest(token);

      if (!request) {
        return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 60px;">
            <h2>Invalid or Already Used Link</h2>
            <p>This device request link is invalid or already used.</p>
          </body>
        </html>
      `);
      }

      await AuthModel.updateDeviceRequestStatus(token, "denied");

      return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; background:#f6f6f6; margin:0; padding:0;">
          <div style="max-width:600px;margin:60px auto;background:#ffffff;padding:40px;border-radius:12px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
            <h2 style="color:#dc2626;">Device Login Denied</h2>

            <p style="font-size:16px;color:#333;line-height:1.6;">
              This new device login request has been blocked.
            </p>

            <p style="font-size:15px;color:#555;line-height:1.6;">
              If this was not you, please change your password immediately.
            </p>
          </div>
        </body>
      </html>
    `);
    } catch (err) {
      console.error("DENY DEVICE ERROR:", err);

      return res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 60px;">
          <h2>Server Error</h2>
          <p>Something went wrong while denying the device.</p>
        </body>
      </html>
    `);
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
     REFRESH ACCESS TOKEN
  ====================================================== */
  async refreshAccessToken(req, res) {
    try {
      const { refreshToken } = req.body;

      const payload = jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET,
      );

      const exists = await AuthModel.findRefreshToken(
        payload.user_id,
        refreshToken,
      );
      if (!exists) return res.status(403).json({ success: false });

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
     LOGOUT (Single Device)
  ====================================================== */
  async logoutUser(req, res) {
    try {
      const { refreshToken } = req.body;

      const payload = jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET,
      );

      await AuthModel.deleteRefreshToken(payload.user_id, refreshToken);

      await AuthModel.clearFcmToken(payload.user_id);

      return res.json({ success: true });
    } catch {
      return res.status(400).json({ success: false });
    }
  }

  /* ======================================================
     LOGOUT ALL DEVICES
  ====================================================== */
  async logoutAllDevices(req, res) {
    try {
      await AuthModel.deleteAllUserRefreshTokens(req.user.user_id);
      await AuthModel.incrementTokenVersion(req.user.user_id);

      return res.json({ success: true });
    } catch {
      return res.status(500).json({ success: false });
    }
  }

  /* ======================================================
     FORGOT PASSWORD
  ====================================================== */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      const user = await AuthModel.findByEmail(email);
      if (!user) return res.json({ success: true });

      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = await bcrypt.hash(rawToken, 10);
      const expiry = new Date(Date.now() + 15 * 60 * 1000);

      await AuthModel.saveResetToken(user.user_id, hashedToken, expiry);

      // Send rawToken in email

      return res.json({ success: true });
    } catch {
      return res.status(500).json({ success: false });
    }
  }

  /* ======================================================
     RESET PASSWORD
  ====================================================== */
  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      const users = await AuthModel.findByResetToken();

      for (const user of users) {
        const match = await bcrypt.compare(token, user.reset_token);

        if (match && new Date() < user.reset_token_expiry) {
          const hashed = await bcrypt.hash(newPassword, 12);

          await AuthModel.updatePassword(user.user_id, hashed);
          await AuthModel.incrementTokenVersion(user.user_id);
          await AuthModel.deleteAllUserRefreshTokens(user.user_id);

          return res.json({ success: true });
        }
      }

      return res.status(400).json({ success: false });
    } catch {
      return res.status(500).json({ success: false });
    }
  }

  /* ======================================================
     RESEND VERIFICATION
  ====================================================== */

  async resendVerification(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ success: false });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const user = await AuthModel.findByEmail(normalizedEmail);

      if (!user) {
        return res.json({ success: true });
      }

      if (user.is_verified) {
        return res.json({ success: true });
      }

      if (
        user.verification_token_expiry &&
        new Date(user.verification_token_expiry) >
          new Date(Date.now() - 30 * 1000)
      ) {
        return res.json({ success: true });
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = await bcrypt.hash(rawToken, 10);
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await AuthModel.updateVerificationToken(
        user.user_id,
        hashedToken,
        expiry,
      );

      // Send email with:
      const token = `${process.env.BACKEND_URL}/api/crm/v1/auth/verify-email?token=${rawToken}`;
      await sendVerificationMail({
        name: user.name,
        email: normalizedEmail,
        token,
      });

      return res.json({
        success: true,
        message:
          "If your email is registered, a verification link has been sent.",
      });
    } catch (error) {
      return res.status(500).json({ success: false });
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

      // invalidate all sessions
      await AuthModel.incrementTokenVersion(connection, userId);
      await AuthModel.deleteAllUserRefreshTokens(connection, userId);

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

      const userInfo = await AuthModel.getUserInfo(userId);

      if (!userInfo) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Get today's steps summary
      const todaySummary = await FitnessService.getTodaySummary(userId);

      return res.json({
        success: true,
        data: {
          ...userInfo,
          steps: {
            steps: todaySummary.steps || 0,
            goal_steps: todaySummary.goal_steps || 0,
            progress_percent: todaySummary.progress_percent || 0,
          },
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
