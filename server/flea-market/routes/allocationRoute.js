const express = require("express");
const router = express.Router();
const allocationController = require("../controllers/allocationController");
const labelController = require("../controllers/labelController");
const { validateAllocate, validateDamageOrAdjust } = require("../middlewares/validators");

// Manager-facing — no auth middleware yet, matching schedule/location/company
// routes elsewhere in this module (no operator auth exists today).
router.get("/", allocationController.list);
router.post("/", validateAllocate, allocationController.allocate);
router.patch("/:allocationId/damage", validateDamageOrAdjust, allocationController.recordDamage);
router.patch("/:allocationId/adjust", validateDamageOrAdjust, allocationController.adjust);
router.get("/:allocationId/logs", allocationController.logs);
router.get("/:allocationId/label", labelController.getSingle);
router.get("/:allocationId/label/print", labelController.printSingle);

module.exports = router;
