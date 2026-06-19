const FitnessModel = require("../models/fitnessModel");
const FitnessService = require("../service/fitnessService");
const db = require("../../../../config/database");

const getErrorStatus = (err) => {
  const badRequestMessages = ["Invalid", "Missing required fields"];
  return badRequestMessages.some((message) => err.message?.startsWith(message))
    ? 400
    : 500;
};

class FitnessController {
  async getOnboardingStatus(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const status = await FitnessService.getOnboardingStatus(userId);

      res.json({
        success: true,
        is_completed: status,
      });
    } catch (err) {
      res.status(getErrorStatus(err)).json({ success: false, message: err.message });
    }
  }

  async selectGoal(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { daily_steps } = req.body;

      await FitnessService.selectGoal(userId, daily_steps);

      res.json({ message: "Goal set successfully" });
    } catch (err) {
      res.status(getErrorStatus(err)).json({ success: false, message: err.message });
    }
  }

  async saveBasicProfile(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }
      const { gender, age, goal_type } = req.body;

      if (!gender || !age || !goal_type) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      const validGoals = ["weight_loss", "weight_gain", "stay_healthy"];

      if (!validGoals.includes(goal_type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid goal type",
        });
      }

      await FitnessService.saveBasicProfile(userId, gender, age, goal_type);

      res.json({
        success: true,
        message: "Profile updated",
      });
    } catch (err) {
      res.status(getErrorStatus(err)).json({ success: false, message: err.message });
    }
  }

  async saveBodyProfile(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { height_cm, weight_kg } = req.body;

      await FitnessService.saveBodyProfile(userId, height_cm, weight_kg);

      res.json({ message: "Body profile updated" });
    } catch (err) {
      res.status(getErrorStatus(err)).json({ success: false, message: err.message });
    }
  }

  async getPlan(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const data = await FitnessService.getPlan(userId);

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getGoal(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const data = await FitnessService.getGoal(userId);

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new FitnessController();
