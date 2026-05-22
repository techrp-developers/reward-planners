const express = require("express");
const router = express.Router();
const v1OnboardingRoutes = require("./onboardingRoute");
const v1AchievementRoutes = require("./achievementRoute");
const v1DashboardRoutes = require("./dashboardRoute");
const v1ProgressRoutes = require("./progressRoute");
const v1StatsRoutes = require("./statsRoute");
const v1StepRoutes = require("./stepRoute");
const v1WalletRoutes = require("./walletRoute");

router.use('/profile', v1OnboardingRoutes);
router.use('/achievement', v1AchievementRoutes);
router.use('/dashboard', v1DashboardRoutes);
router.use('/progress', v1ProgressRoutes);
router.use('/stats', v1StatsRoutes);
router.use('/steps', v1StepRoutes);
router.use('/wallet', v1WalletRoutes);


module.exports = router;