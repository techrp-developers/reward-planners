const express = require("express");
const router = express.Router();
const poolStockController = require("../controllers/poolStockController");
const labelController = require("../controllers/labelController");
const { validateTopUp, validateDamageOrAdjust, validateReturn, validateUpdatePrice } = require("../middlewares/validators");

// Manager-facing — no auth middleware yet, matching schedule/location/company
// routes elsewhere in this module (no operator auth exists today).
//
// Replaces the old /allocations routes now that stock lives in a persistent
// per-vendor-variant pool rather than a row per event — "list" is unscoped
// (every active pool, not one event's), and top-up is an upsert rather than
// a create (see poolStockService.topUp).
router.get("/", poolStockController.list);
router.post("/", validateTopUp, poolStockController.topUp);
router.patch("/:poolId/damage", validateDamageOrAdjust, poolStockController.recordDamage);
router.patch("/:poolId/adjust", validateDamageOrAdjust, poolStockController.adjust);
router.post("/:poolId/return", validateReturn, poolStockController.returnToVendor);
router.patch("/:poolId/price", validateUpdatePrice, poolStockController.updatePrice);
router.delete("/:poolId", poolStockController.remove);
router.get("/:poolId/logs", poolStockController.logs);
router.get("/:poolId/label", labelController.getSingle);
router.get("/:poolId/label/print", labelController.printSingle);

// Bulk label print — every currently-active pool, not scoped to one event.
router.get("/labels", labelController.getAll);
router.get("/labels/print", labelController.printAll);

module.exports = router;
