const FitnessModel = require("../models/fitnessModel");
const FitnessService = require("../service/fitnessService");
const db = require("../../../../config/database");

const getErrorStatus = (err) => {
  const badRequestMessages = [
    "Invalid",
    "Only today's steps",
    "Suspicious",
    "No goal set",
  ];
  return badRequestMessages.some((message) => err.message?.startsWith(message))
    ? 400
    : 500;
};

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
        message: err.message,
      });
    }
  }
}

module.exports = new StepController();
