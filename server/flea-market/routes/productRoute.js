const express = require("express");
const multer = require("multer");
const router = express.Router();
const productController = require("../controllers/productController");
const requireFleaMarketLocation = require("../middlewares/requireFleaMarketLocation");

// Memory storage, not the app's disk-based image upload middleware — a CSV
// import is parsed once and discarded, never persisted to disk.
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — generous for a product CSV
});

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

// Bulk quick-create from a CSV upload — reuses productQuickCreateService
// per grouped product, same as the single-product form.
router.post("/import", csvUpload.single("file"), productController.importCsv);

// CSV export — same column order as import, so an exported file can be
// edited and re-uploaded unchanged.
router.get("/export", productController.exportCsv);

module.exports = router;
