const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const requireFleaMarketLocation = require("../middlewares/requireFleaMarketLocation");

// Location-scoped, not customer-scoped — an operator can search and price a
// cart before any customer is picked (see requireFleaMarketLocation).
router.get("/search", requireFleaMarketLocation, productController.search);
router.get("/:variantId/reward-eligibility", requireFleaMarketLocation, productController.rewardEligibility);

// Manager-facing (allocation page) — master-catalog search/create, not scoped
// to a customer session. No auth middleware yet, matching schedule/location/
// company routes elsewhere in this module (no operator auth exists today).
router.get("/catalog-search", productController.catalogSearch);
router.post("/", require("../middlewares/validators").validateQuickCreateProduct, productController.quickCreate);

// Manager-facing "All Products" overview — live pricing + reward breakdown
// across the whole catalog, not customer billing, so no location scoping.
router.get("/all/filter-options", productController.listAllFilterOptions);
router.get("/all", productController.listAll);

module.exports = router;
