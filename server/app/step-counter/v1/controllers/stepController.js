const FitnessModel = require("../models/fitnessModel");
const FitnessService = require("../service/fitnessService");
const db = require("../../../../config/database");
const { getErrorStatus, getSafeErrorMessage } = require("../utils/errorResponse");

class StepController {
  async syncSteps(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const result = await FitnessService.syncSteps(userId, req.body);

      res.json(result);
    } catch (err) {
      res.status(getErrorStatus(err)).json({
        success: false,
        message: getSafeErrorMessage(err),
      });
    }
  }
}

module.exports = new StepController();
