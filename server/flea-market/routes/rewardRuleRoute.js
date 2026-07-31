const express = require("express");
const router = express.Router();
const rewardRuleController = require("../controllers/rewardRuleController");

// Manager-facing, no auth middleware yet — matches schedule/location/company
// routes elsewhere in this module (no operator auth exists today).
router.get("/", rewardRuleController.list);

module.exports = router;
