const crypto = require("crypto");
const CompanyWalletModel = require("../models/companyWalletModel");
const { sendIndividualAppreciation } = require("../services/mailBuilder/individualAppreciation");
const { sendTeamAppreciation } = require("../services/mailBuilder/teamAppreciation");
const { sendDepartmentAppreciation } = require("../services/mailBuilder/departmentAppreciation");
const { enqueueWhatsApp } = require("../services/whatsapp/waEnqueueService");

function companyIdFor(req) {
  return req.user?.role === "hr"
    ? Number(req.user.company_id)
    : Number(req.body?.company_id || req.query?.company_id);
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

class CompanyWalletController {
  async summary(req, res) {
    try {
      const companyId = companyIdFor(req);
      if (!companyId) return res.status(400).json({ success: false, message: "A company is required" });
      return res.json({ success: true, data: await CompanyWalletModel.getSummary(companyId) });
    } catch (error) {
      console.error("Company wallet summary error:", error);
      return res.status(500).json({ success: false, message: "Unable to fetch company wallet" });
    }
  }

  async transactions(req, res) {
    try {
      const companyId = companyIdFor(req);
      if (!companyId) return res.status(400).json({ success: false, message: "A company is required" });
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
      const result = await CompanyWalletModel.getTransactions({
        companyId, type: String(req.query.type || "all"), page, limit,
      });
      return res.json({
        success: true,
        data: result.rows,
        pagination: { page, limit, total: result.total, total_pages: Math.ceil(result.total / limit) },
      });
    } catch (error) {
      console.error("Company wallet transactions error:", error);
      return res.status(500).json({ success: false, message: "Unable to fetch wallet transactions" });
    }
  }

  async award(req, res) {
    try {
      const companyId = companyIdFor(req);
      const rawIds = req.body.employee_ids || (req.body.employee_id ? [req.body.employee_id] : []);
      const employeeIds = [...new Set(rawIds.map(Number).filter(Number.isSafeInteger))];
      const points = positiveInteger(req.body.points);
      const allocationType = String(req.body.allocation_type || "individual").toLowerCase();
      if (!["individual", "team", "department"].includes(allocationType)) {
        return res.status(400).json({ success: false, message: "Invalid allocation_type" });
      }
      if (!companyId || !employeeIds.length || !points) {
        return res.status(400).json({ success: false, message: "employee_id(s) and positive integer points are required" });
      }
      if (employeeIds.length > 500) {
        return res.status(400).json({ success: false, message: "A maximum of 500 employees can be rewarded at once" });
      }
      const result = await CompanyWalletModel.awardEmployees({
        companyId,
        employeeIds,
        points,
        title: String(req.body.title || "Company reward").trim().slice(0, 150),
        description: String(req.body.description || req.body.note || "").trim().slice(0, 500) || null,
        referenceKey: String(req.body.reference_key || crypto.randomUUID()).slice(0, 80),
        createdBy: req.user.user_id,
      });

      const notificationResults = await Promise.all(
        result.awards.map(async (award) => {
          const mailData = {
            email: award.email,
            employeeName: award.name,
            rewardPoints: award.points,
            category: String(req.body.category || req.body.title || "Appreciation Reward"),
            awardedBy: req.user.email || "HR Team",
            appreciationNote: req.body.description || req.body.note || undefined,
            teamName: req.body.group_name,
            groupName: req.body.group_name,
          };
          const sendAppreciationMail = allocationType === "team"
            ? sendTeamAppreciation
            : allocationType === "department"
              ? sendDepartmentAppreciation
              : sendIndividualAppreciation;
          const [email, whatsapp] = await Promise.all([
            award.email
              ? sendAppreciationMail(mailData)
              : Promise.resolve({ ok: false, reason: "EMAIL_MISSING" }),
            award.phone
              ? enqueueWhatsApp({
                  eventName: "rewardpointsupdate",
                  ctx: {
                    company_id: companyId,
                    customer_name: award.name,
                    phone: award.phone,
                    points: award.points,
                    balance: award.balance,
                    order_id: award.transaction_id,
                  },
                })
              : Promise.resolve({ ok: false, reason: "PHONE_MISSING" }),
          ]);
          return { employee_id: award.employee_id, email, whatsapp };
        }),
      );

      return res.status(201).json({
        success: true,
        message: "Points awarded successfully",
        data: { ...result, notifications: notificationResults },
      });
    } catch (error) {
      if (error.code === "INSUFFICIENT_BALANCE") return res.status(409).json({ success: false, message: error.message });
      if (["INVALID_EMPLOYEES", "INACTIVE_EMPLOYEES", "CUSTOMER_NOT_ONBOARDED", "CUSTOMER_INACTIVE"].includes(error.code)) {
        return res.status(400).json({ success: false, code: error.code, message: error.message });
      }
      if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "This reward request was already processed" });
      console.error("Company wallet award error:", error);
      return res.status(500).json({ success: false, message: "Unable to award points" });
    }
  }

  async fund(req, res) {
    try {
      const companyId = companyIdFor(req);
      const points = positiveInteger(req.body.points);
      if (!companyId || !points) return res.status(400).json({ success: false, message: "company_id and positive integer points are required" });
      const result = await CompanyWalletModel.fund({
        companyId,
        points,
        description: String(req.body.description || "").trim().slice(0, 500) || null,
        referenceKey: String(req.body.reference_key || crypto.randomUUID()).slice(0, 120),
        createdBy: req.user.user_id,
      });
      return res.status(201).json({ success: true, message: "Company wallet funded successfully", data: result });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "This funding request was already processed" });
      console.error("Company wallet funding error:", error);
      return res.status(500).json({ success: false, message: "Unable to fund company wallet" });
    }
  }
}

module.exports = new CompanyWalletController();
