const FitnessModel = require("../models/fitnessModel");
const FitnessService = require("../service/fitnessService");
const db = require("../../../../config/database");

class DashboardController {
  async getDashboard(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const data = await FitnessService.getDashboard(userId);

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getTodaySummary(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const data = await FitnessService.getTodaySummary(userId);

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getWeeklyProgress(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const data = await FitnessService.getWeeklyProgress(userId);

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getStreak(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const data = await FitnessService.getStreak(userId);

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new DashboardController();
