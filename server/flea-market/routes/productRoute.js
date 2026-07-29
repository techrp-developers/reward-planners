const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const requireFleaMarketSession = require("../middlewares/requireFleaMarketSession");

router.get("/search", requireFleaMarketSession, productController.search);
router.get("/:variantId/reward-eligibility", requireFleaMarketSession, productController.rewardEligibility);

// Manager-facing (allocation page) — master-catalog search/create, not scoped
// to a customer session. No auth middleware yet, matching schedule/location/
// company routes elsewhere in this module (no operator auth exists today).
router.get("/catalog-search", productController.catalogSearch);
router.post("/", require("../middlewares/validators").validateQuickCreateProduct, productController.quickCreate);

module.exports = router;
