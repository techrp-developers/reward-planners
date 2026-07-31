const customerModel = require("../models/customerModel");
const otpService = require("../services/otpService");

const MIN_QUERY_LENGTH = 3;
const SEARCH_LIMIT = 10;

function sendServiceError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error("[flea-market][customer] error:", error);
  }
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? fallbackMessage : error.message,
    ...(error.extra || {}),
  });
}

class CustomerController {
  // Tenant-scoped: always filters by company_id — never searches across companies.
  async search(req, res) {
    try {
      const companyId = Number(req.query.company_id);
      const query = String(req.query.q || "").trim();

      if (!Number.isInteger(companyId) || companyId <= 0) {
        return res.status(400).json({ success: false, message: "company_id query param is required" });
      }
      if (query.length < MIN_QUERY_LENGTH) {
        return res.status(400).json({
          success: false,
          message: `Search query must be at least ${MIN_QUERY_LENGTH} characters`,
        });
      }

      const rows = await customerModel.search(companyId, query, SEARCH_LIMIT);

      return res.json({
        success: true,
        data: rows.map((row) => ({ userId: row.user_id, name: row.name, email: row.email, phone: row.phone })),
      });
    } catch (error) {
      console.error("[flea-market][customer-search] error:", error);
      return res.status(500).json({ success: false, message: "Failed to search customers" });
    }
  }

  async sendOtp(req, res) {
    try {
      const locationId = Number(req.header("X-Location-Id"));
      const { userId, channel } = req.body;

      const result = await otpService.sendOtp({ userId, channel, locationId });
      return res.json({ success: true, data: result });
    } catch (error) {
      return sendServiceError(res, error, "Failed to send OTP");
    }
  }

  // Picks a customer from search without requiring OTP — enough to build a cart,
  // not enough to redeem reward points (see otpService.selectCustomer).
  async selectCustomer(req, res) {
    try {
      const locationId = Number(req.header("X-Location-Id"));
      const { userId } = req.body;

      const result = await otpService.selectCustomer({ userId, locationId });
      return res.json({ success: true, data: result });
    } catch (error) {
      return sendServiceError(res, error, "Failed to select customer");
    }
  }

  async verifyOtp(req, res) {
    try {
      const locationId = Number(req.header("X-Location-Id"));
      const { userId, otp, channel } = req.body;

      const result = await otpService.verifyOtp({ userId, otp, channel, locationId });
      return res.json({ success: true, data: result });
    } catch (error) {
      return sendServiceError(res, error, "Failed to verify OTP");
    }
  }

  // Session expiry recovery path — same OTP flow, kept as a separate endpoint so the
  // frontend's reverify UI can call one route regardless of send-vs-verify step.
  async reverify(req, res) {
    try {
      const locationId = Number(req.header("X-Location-Id"));
      const { userId, channel, otp } = req.body;

      if (otp && channel) {
        const result = await otpService.verifyOtp({ userId, otp, channel, locationId });
        return res.json({ success: true, data: result });
      }

      if (!channel) {
        return res.status(400).json({ success: false, message: "channel is required to (re)send an OTP" });
      }

      const result = await otpService.sendOtp({ userId, channel, locationId });
      return res.json({ success: true, data: result });
    } catch (error) {
      return sendServiceError(res, error, "Failed to reverify customer");
    }
  }
}

module.exports = new CustomerController();
