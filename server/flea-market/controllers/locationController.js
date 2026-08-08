const locationModel = require("../models/locationModel");

class LocationController {
  async list(req, res) {
    try {
      const companyId = Number(req.query.company_id);

      if (!Number.isInteger(companyId) || companyId <= 0) {
        return res.status(400).json({ success: false, message: "company_id query param is required" });
      }

      const rows = await locationModel.findActiveByCompany(companyId);

      return res.json({
        success: true,
        data: rows.map((row) => ({ locationId: row.location_id, name: row.name, address: row.address })),
      });
    } catch (error) {
      console.error("[flea-market][locations] error:", error);
      return res.status(500).json({ success: false, message: "Failed to fetch locations" });
    }
  }
}

module.exports = new LocationController();
