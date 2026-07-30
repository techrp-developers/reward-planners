// app/games/v1/routes/quizRoute.js
const express = require("express");
const router = express.Router();
const quizController = require("../controller/quizController");

router.get("/quiz", quizController.getDailyQuizState);
router.post("/submit", quizController.submitDailyQuiz);
router.get("/leaderboard", quizController.getLeaderboard);
router.get("/rewards", quizController.getRewardsCatalog);
router.post("/redeem", quizController.redeemReward);
router.post("/active-employee", quizController.setActiveEmployee);

module.exports = router;
