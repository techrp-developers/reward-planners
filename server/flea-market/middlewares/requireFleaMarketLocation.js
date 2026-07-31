const locationModel = require("../models/locationModel");

// Product search, reward-eligibility and barcode scan only ever need "which
// active location is this operator at" — no customer identity, unlike
// requireFleaMarketSession (checkout/invoices, where a real customer is
// required to attribute the invoice/wallet movement to). Lets the operator
// build a cart before any customer is picked at all.
const requireFleaMarketLocation = async (req, res, next) => {
  try {
    const locationId = Number(req.header("X-Location-Id"));

    if (!Number.isInteger(locationId) || locationId <= 0) {
      return res.status(400).json({ success: false, message: "X-Location-Id header is required" });
    }

    const location = await locationModel.findActiveById(locationId);
    if (!location) {
      return res.status(400).json({ success: false, message: "Unknown or inactive location" });
    }

    req.fleaMarketLocation = { locationId: location.location_id, companyId: location.company_id };
    next();
  } catch (err) {
    console.error("[flea-market] location check error:", err);
    return res.status(500).json({ success: false, message: "Failed to validate location" });
  }
};

module.exports = requireFleaMarketLocation;
