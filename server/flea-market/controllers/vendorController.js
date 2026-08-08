const vendorService = require("../services/vendorService");

function sendServiceError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error("[flea-market][vendor] error:", error);
  }
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? fallbackMessage : error.message,
  });
}

class VendorController {
  async search(req, res) {
    try {
      const query = String(req.query.q || "").trim();
      const rows = await vendorService.search(query);

      return res.json({
        success: true,
        data: rows.map((row) => ({
          vendorId: row.vendor_id,
          companyName: row.company_name,
          fullName: row.full_name,
        })),
      });
    } catch (error) {
      return sendServiceError(res, error, "Failed to search vendors");
    }
  }

  async quickCreate(req, res) {
    try {
      const { companyName, fullName, email, phone } = req.body;
      const result = await vendorService.quickCreate({ companyName, fullName, email, phone });

      return res.status(201).json({
        success: true,
        data: { vendorId: result.vendorId, companyName, fullName },
      });
    } catch (error) {
      return sendServiceError(res, error, "Failed to create vendor");
    }
  }
}

module.exports = new VendorController();
