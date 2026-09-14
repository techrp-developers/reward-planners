const PollModel = require("../../../models/pollModel");

class PollController {
  async list(req, res) {
    try {
      const polls = await PollModel.listForEmployee(req.user.user_id);
      if (polls === null) {
        return res.status(403).json({ success: false, message: "Your account is not linked to an active company" });
      }
      return res.json({ success: true, data: polls });
    } catch (error) {
      console.error("Unable to load employee polls:", error);
      return res.status(500).json({ success: false, message: "Unable to load polls" });
    }
  }

  async vote(req, res) {
    const pollId = Number(req.params.poll_id);
    const rawIds = Array.isArray(req.body?.option_ids) ? req.body.option_ids : [];
    const optionIds = [...new Set(rawIds.map(Number))];
    if (!Number.isInteger(pollId) || pollId < 1 || !optionIds.length || optionIds.some((id) => !Number.isInteger(id) || id < 1)) {
      return res.status(400).json({ success: false, message: "A poll and at least one valid option are required" });
    }
    try {
      const result = await PollModel.vote({ pollId, userId: req.user.user_id, optionIds });
      const errors = {
        COMPANY_REQUIRED: [403, "Your account is not linked to an active company"],
        POLL_UNAVAILABLE: [404, "This poll is unavailable, closed, or belongs to another company"],
        SINGLE_ANSWER: [422, "This poll allows only one answer"],
        INVALID_OPTIONS: [422, "One or more selected options do not belong to this poll"],
      };
      if (result.error) {
        const [status, message] = errors[result.error] || [400, "Unable to submit vote"];
        return res.status(status).json({ success: false, message });
      }
      const polls = await PollModel.listForEmployee(req.user.user_id);
      return res.json({ success: true, message: "Vote submitted",
        data: polls.find((poll) => String(poll.poll_id) === String(pollId)) || null });
    } catch (error) {
      console.error("Unable to submit poll vote:", error);
      return res.status(500).json({ success: false, message: "Unable to submit vote" });
    }
  }
}

module.exports = new PollController();
