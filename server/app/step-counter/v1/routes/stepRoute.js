const express = require("express");
const router = express.Router();
const StepController = require("../controllers/stepController");
const auth = require("../../../common/middlewares/auth");
const { stepSyncLimiter } = require("../../../common/middlewares/rateLimiter");

// steps sync
router.post("/sync", auth, stepSyncLimiter, StepController.syncSteps);

module.exports = router;
