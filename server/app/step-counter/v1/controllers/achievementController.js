const FitnessModel = require("../models/fitnessModel");
const FitnessService = require("../service/fitnessService");
const db = require("../../../../config/database");
const { getErrorStatus, getSafeErrorMessage } = require("../utils/errorResponse");

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
      res.status(getErrorStatus(err)).json({ error: getSafeErrorMessage(err) });
    }
  }
}

module.exports = new AchievementController();
