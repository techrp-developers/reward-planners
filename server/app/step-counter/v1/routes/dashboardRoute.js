const express = require("express");
const router = express.Router();
const DashboardController = require("../controllers/dashboardController");
const auth = require("../../../common/middlewares/auth");

// Dashboard
router.get("/", auth, DashboardController.getDashboard);

// todays summary
router.get("/today-summary", auth, DashboardController.getTodaySummary);

// weekly progress
router.get("/weekly-progress", auth, DashboardController.getWeeklyProgress);

// fitness streak
router.get("/fitness-streak", auth, DashboardController.getStreak);

module.exports = router;
