const GlobalModel = require("../models/globalModel");
const AuthModel = require("../models/authModel");
const db = require("../../../config/database");
const {
  enqueueWhatsApp,
} = require("../../../services/whatsapp/waEnqueueService");
const { notifyUser } = require("../utils/notification");
const { runNonBlocking } = require("../../../utils/nonBlocking");

const LAUNCH_CAMPAIGN_COMPANY_ID = 7;
const IOS_LAUNCH_COMPANY_ID = 5;
const FLEA_MARKET_INAMDAR_COMPANY_ID = 5;

class GlobalController {
  // get balance
  async getGlobalSuggestions(req, res) {
    try {
      const search = (req.query.q || "").trim();

      if (!search || search.length < 2) {
        return res.json({
          success: true,
          data: {},
        });
      }

      const data = await GlobalModel.getGlobalSuggestions(search);

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get app status
  async getAppStatus(req, res) {
    try {
      const [rows] = await db.execute(`
      SELECT
        maintenance_mode,
        drain_mode,
        maintenance_start_at
      FROM app_settings
      LIMIT 1
    `);

      return res.json({
        success: true,
        data: rows[0],
      });
    } catch (error) {
      throw error;
    }
  }

  async creditWallet(req, res) {
    try {
      const {
        email,
        coins,
        title = "Reward Points Credited",
        description = "Reward points have been credited to your account",
      } = req.body;

      const normalizedEmail = String(email || "")
        .trim()
        .toLowerCase();
      const creditCoins = Number(coins);

      if (
        !normalizedEmail ||
        !Number.isFinite(creditCoins) ||
        creditCoins <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Email and valid coins are required",
        });
      }

      const result = await GlobalModel.creditWalletByEmail({
        email: normalizedEmail,
        coins: creditCoins,
        title,
        description,
      });

      // notifyUser(
      //   {
      //     userId: result.user.user_id,
      //     module: "wallet",
      //     type: "wallet_credit",
      //     title,
      //     message: `${result.coins} reward points have been credited to your account.`,
      //     icon: "wallet",
      //     reference_type: "wallet",
      //     reference_id: result.transactionId,
      //     action_url: "/wallet",
      //     metadata: {
      //       coins: result.coins,
      //       balance: result.balance,
      //       transaction_id: result.transactionId,
      //     },
      //   },
      //   "manual wallet credit notification",
      // );

      runNonBlocking(async () => {
        const employee = await AuthModel.findEmployeeByEmail(normalizedEmail);

        if (employee?.phone) {
          const waResult = await enqueueWhatsApp({
            eventName: "rewardpointsupdate",
            ctx: {
              phone: employee.phone,
              company_id: employee.company_id,
              order_id: result.transactionId,
              customer_name: employee.name || result.user.name,
              coins: result.coins,
              points: result.coins,
              balance: result.balance,
            },
          });

          if (!waResult.ok) {
            console.warn("[WALLET_CREDIT_WA] WhatsApp not queued:", waResult);
          }
        }
      }, "manual wallet credit WhatsApp");

      return res.json({
        success: true,
        message: "Reward points credited successfully",
        data: result,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Launch event message
  async sendLaunchCampaign(req, res) {
    try {
      const employees = await GlobalModel.getEmployeesForCampaign(
        LAUNCH_CAMPAIGN_COMPANY_ID,
      );

      runNonBlocking(async () => {
        let queued = 0;
        let failed = 0;
        let skipped = 0;

        for (const employee of employees) {
          if (!employee.contact) {
            skipped += 1;
            continue;
          }

          const waResult = await enqueueWhatsApp({
            eventName: "reward_planners_launch_lavender",
            ctx: {
              phone: employee.contact,
              company_id: employee.company_id,
              customer_name: employee.name || "Employee",
              contact: employee.contact,
            },
          });

          if (waResult.ok) {
            queued += 1;
          } else {
            failed += 1;
            console.warn("[LAUNCH_CAMPAIGN_WA] WhatsApp not queued:", {
              employee_id: employee.id,
              phone: employee.contact,
              result: waResult,
            });
          }
        }

        console.info("[LAUNCH_CAMPAIGN_WA] Completed", {
          company_id: LAUNCH_CAMPAIGN_COMPANY_ID,
          total: employees.length,
          queued,
          failed,
          skipped,
        });
      }, "launch campaign WhatsApp");

      return res.json({
        success: true,
        message: "Launch campaign queued",
        company_id: LAUNCH_CAMPAIGN_COMPANY_ID,
        total: employees.length,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // IOS update campaign
  async iosUpdateCampaign(req, res) {
    try {
      const employees = await GlobalModel.getCampaignRecipients(
        IOS_LAUNCH_COMPANY_ID,
      );

      runNonBlocking(async () => {
        let queued = 0;
        let failed = 0;
        let skipped = 0;

        for (const employee of employees) {
          if (!employee.contact) {
            skipped += 1;
            continue;
          }

          const waResult = await enqueueWhatsApp({
            eventName: "reward_planners_ios_launch",
            ctx: {
              phone: employee.contact,
              company_id: employee.company_id,
              customer_name: employee.name || "Employee",
              contact: employee.contact,
            },
          });

          if (waResult.ok) {
            queued += 1;
          } else {
            failed += 1;
            console.warn("[IOS_UPDATE_CAMPAIGN_WA] WhatsApp not queued:", {
              employee_id: employee.id,
              phone: employee.contact,
              result: waResult,
            });
          }
        }

        console.info("[IOS_UPDATE_CAMPAIGN_WA] Completed", {
          company_id: IOS_LAUNCH_COMPANY_ID,
          total: employees.length,
          queued,
          failed,
          skipped,
        });
      }, "iOS update campaign WhatsApp");

      return res.json({
        success: true,
        message: "iOS update campaign queued",
        company_id: IOS_LAUNCH_COMPANY_ID,
        total: employees.length,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Flea Market Inamdar event campaign
  async fleaMarketInamdarCampaign(req, res) {
    try {
      const employees = await GlobalModel.getCampaignRecipients(
        FLEA_MARKET_INAMDAR_COMPANY_ID,
      );

      runNonBlocking(async () => {
        let queued = 0;
        let failed = 0;
        let skipped = 0;

        for (const employee of employees) {
          if (!employee.contact) {
            skipped += 1;
            continue;
          }

          const waResult = await enqueueWhatsApp({
            eventName: "flea_market_inamdar",
            ctx: {
              phone: employee.contact,
              company_id: employee.company_id,
              customer_name: employee.name || "Employee",
              contact: employee.contact,
            },
          });

          if (waResult.ok) {
            queued += 1;
          } else {
            failed += 1;
            console.warn("[FLEA_MARKET_INAMDAR_WA] WhatsApp not queued:", {
              employee_id: employee.id,
              phone: employee.contact,
              result: waResult,
            });
          }
        }

        console.info("[FLEA_MARKET_INAMDAR_WA] Completed", {
          company_id: FLEA_MARKET_INAMDAR_COMPANY_ID,
          total: employees.length,
          queued,
          failed,
          skipped,
        });
      }, "Flea Market Inamdar WhatsApp");

      return res.json({
        success: true,
        message: "Flea Market Inamdar campaign queued",
        company_id: FLEA_MARKET_INAMDAR_COMPANY_ID,
        total: employees.length,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
}
module.exports = new GlobalController();
