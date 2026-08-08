const companyModel = require("../models/companyModel");

class CompanyController {
  // Scoped to the flea-market API surface (client's shared /api/crm company
  // list lives in a different, unrelated backend namespace) — used to
  // populate the "Company" dropdown on the Add Schedule form.
  async list(req, res) {
    try {
      const rows = await companyModel.listActive();
      return res.json({
        success: true,
        data: rows.map((row) => ({ companyId: row.company_id, companyName: row.company_name })),
      });
    } catch (error) {
      console.error("[flea-market][companies] error:", error);
      return res.status(500).json({ success: false, message: "Failed to fetch companies" });
    }
  }
}

module.exports = new CompanyController();
