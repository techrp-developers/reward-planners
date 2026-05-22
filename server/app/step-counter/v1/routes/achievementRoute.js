const express = require("express");
const router = express.Router();
const AchievementController = require("../controllers/achievementController");
const auth = require("../../../common/middlewares/auth");

// achievements
router.get("/", auth, AchievementController.getAchievements);

module.exports = router;
