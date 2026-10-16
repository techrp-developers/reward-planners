const express = require("express");
const router = express.Router();
const rewardRuleController = require("../controllers/rewardRuleController");

// Manager authentication is enforced by the parent Flea Market router.
router.get("/", rewardRuleController.list);

module.exports = router;
