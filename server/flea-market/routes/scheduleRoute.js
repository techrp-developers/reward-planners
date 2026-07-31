const express = require("express");
const router = express.Router();
const scheduleController = require("../controllers/scheduleController");
const poolStockController = require("../controllers/poolStockController");
const { validateCreateSchedule, validateUpdateSchedule } = require("../middlewares/validators");

router.get("/today-active", scheduleController.todayActive);
router.get("/:scheduleId", scheduleController.getById);
router.get("/", scheduleController.list);
router.post("/", validateCreateSchedule, scheduleController.create);
router.patch("/:scheduleId", validateUpdateSchedule, scheduleController.update);
router.delete("/:scheduleId", scheduleController.remove);

// Closing an event is now just a status change — PATCH /:scheduleId with
// {status: 'completed'} (validated by VALID_TRANSITIONS in scheduleService)
// covers it, since stock pools persist across events and there's no more
// "return unsold stock" step to do at close time. No dedicated /close route.

// Read-only — "how did THIS event perform," sourced from
// flea_market_stock_logs, not a stock table (pools aren't per-event).
router.get("/:scheduleId/event-summary", poolStockController.eventSummary);

module.exports = router;

