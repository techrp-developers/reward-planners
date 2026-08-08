const vendorFleaMarketPurchasesService = require("../services/vendorFleaMarketPurchasesService");

class VendorFleaMarketPurchasesController {
  async filterOptions(req, res) {
    try {
      const vendorId = req.user?.vendor_id;

      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      const data = await vendorFleaMarketPurchasesService.getFilterOptions(vendorId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("[vendor][flea-market-purchases] filter-options error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch filter options",
      });
    }
  }

  // vendorId is read ONLY from req.user.vendor_id (set by authenticateToken
  // from the verified session) — req.query is never trusted for it, so a
  // spoofed ?vendor_id=... in the request is simply never looked at.
  async purchases(req, res) {
    try {
      const vendorId = req.user?.vendor_id;

      if (!vendorId) {
        return res.status(400).json({
          success: false,
          message: "Vendor ID is required",
        });
      }

      const data = await vendorFleaMarketPurchasesService.getPurchases(vendorId, req.query);
      return res.json({ success: true, data });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) {
        console.error("[vendor][flea-market-purchases] error:", error);
      }
      return res.status(statusCode).json({
        success: false,
        message: statusCode >= 500 ? "Failed to fetch flea market purchases" : error.message,
      });
    }
  }
}

module.exports = new VendorFleaMarketPurchasesController();
