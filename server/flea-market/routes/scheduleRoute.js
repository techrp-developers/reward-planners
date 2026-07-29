const express = require("express");
const router = express.Router();
const scheduleController = require("../controllers/scheduleController");
const allocationController = require("../controllers/allocationController");
const labelController = require("../controllers/labelController");
const { validateCreateSchedule, validateUpdateSchedule } = require("../middlewares/validators");

router.get("/today-active", scheduleController.todayActive);
router.get("/:scheduleId", scheduleController.getById);
router.get("/", scheduleController.list);
router.post("/", validateCreateSchedule, scheduleController.create);
router.patch("/:scheduleId", validateUpdateSchedule, scheduleController.update);
router.delete("/:scheduleId", scheduleController.remove);

// Stock allocation close-out — read-only preview vs. the irreversible commit,
// intentionally separate endpoints so the frontend can force a confirm step.
router.get("/:scheduleId/reconciliation", allocationController.reconciliationPreview);
router.post("/:scheduleId/close", allocationController.close);

router.get("/:scheduleId/labels", labelController.getForSchedule);
router.get("/:scheduleId/labels/print", labelController.printForSchedule);

module.exports = router;

