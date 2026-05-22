const express = require("express");
const router = express.Router();
const StatsController = require("../controllers/statsController");
const auth = require("../../../common/middlewares/auth");

// stats
router.get("/", auth,StatsController.getStats);

router.get("/today-hourly-stats", auth, StatsController.getHourlyStats);


module.exports = router;
