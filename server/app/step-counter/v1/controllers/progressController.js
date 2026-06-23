const FitnessModel = require("../models/fitnessModel");
const FitnessService = require("../service/fitnessService");
const db = require("../../../../config/database");
const { getErrorStatus, getSafeErrorMessage } = require("../utils/errorResponse");

class ProgressController {
  async getCalendar(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }
      let { month } = req.query;

      if (!month) {
        const now = new Date();
        month = now.toISOString().slice(0, 7); // YYYY-MM
      }

      const data = await FitnessService.getCalendar(userId, month);

      res.json({
        success: true,
        ...data,
      });
    } catch (err) {
      res.status(getErrorStatus(err)).json({ error: getSafeErrorMessage(err) });
    }
  }
}

module.exports = new ProgressController();
