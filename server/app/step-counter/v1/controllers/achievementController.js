const FitnessModel = require("../models/fitnessModel");
const FitnessService = require("../service/fitnessService");
const db = require("../../../../config/database");

class AchievementController {
  async getAchievements(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const data = await FitnessService.getAchievements(userId);

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new AchievementController();
