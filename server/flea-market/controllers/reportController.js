const reportService = require("../services/reportService");

function sendServiceError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error("[flea-market][report] error:", error);
  }
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? fallbackMessage : error.message,
  });
}

class ReportController {
  async filterOptions(req, res) {
    try {
      const data = await reportService.getFilterOptions(req.query);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch report filter options");
    }
  }

  async vendorSales(req, res) {
    try {
      const data = await reportService.getVendorSalesReport(req.query);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch vendor sales rows");
    }
  }

  async vendorPointsRedeemed(req, res) {
    try {
      const data = await reportService.getVendorPointsRedeemedReport(req.query);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch vendor points redeemed");
    }
  }

  async vendorSalesSummary(req, res) {
    try {
      const data = await reportService.getVendorSalesSummary(req.query);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch vendor sales report");
    }
  }

  async purchaseHistoryFilterOptions(req, res) {
    try {
      const data = await reportService.getPurchaseHistoryFilterOptions();
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch purchase history filter options");
    }
  }

  async purchaseHistory(req, res) {
    try {
      const data = await reportService.getPurchaseHistory(req.query);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch purchase history");
    }
  }
}

module.exports = new ReportController();
