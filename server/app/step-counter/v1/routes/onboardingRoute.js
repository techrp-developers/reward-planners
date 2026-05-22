const express = require("express");
const router = express.Router();
const FitnessController = require("../controllers/fitnessController");
const auth = require("../../../common/middlewares/auth");

// check user exists
router.get("/status", auth, FitnessController.getOnboardingStatus);

// select goals for user
router.post("/select-goals", auth, FitnessController.selectGoal);

// basic profile
router.post("/basic", auth, FitnessController.saveBasicProfile);

router.post("/body", auth, FitnessController.saveBodyProfile);

// Get plan
router.get("/plan", auth, FitnessController.getPlan);

// goal Info
router.get("/goal", auth, FitnessController.getGoal);

module.exports = router;
