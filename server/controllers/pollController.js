const PollModel = require("../models/pollModel");

function companyIdFor(req) {
  return Number(req.user?.company_id);
}

exports.list = async (req, res) => {
  try {
    return res.json({ success: true, data: await PollModel.list(companyIdFor(req)) });
  } catch (error) {
    console.error("Unable to list polls:", error);
    return res.status(500).json({ success: false, message: "Unable to load polls" });
  }
};

exports.participants = async (req, res) => {
  const pollId = Number(req.params.id);
  if (!Number.isInteger(pollId) || pollId < 1) {
    return res.status(400).json({ success: false, message: "Invalid poll" });
  }
  try {
    const data = await PollModel.getParticipants(pollId, companyIdFor(req));
    return data
      ? res.json({ success: true, data })
      : res.status(404).json({ success: false, message: "Poll not found" });
  } catch (error) {
    console.error("Unable to load poll participants:", error);
    return res.status(500).json({ success: false, message: "Unable to load participants" });
  }
};

exports.create = async (req, res) => {
  const question = String(req.body?.question || "").trim();
  const options = Array.isArray(req.body?.options)
    ? req.body.options.map((option) => String(option || "").trim()).filter(Boolean)
    : [];
  const uniqueOptions = [...new Set(options.map((option) => option.toLocaleLowerCase()))];
  const closesAt = req.body?.closes_at ? new Date(req.body.closes_at) : null;

  if (question.length < 3 || question.length > 500) {
    return res.status(400).json({ success: false, message: "Question must be between 3 and 500 characters" });
  }
  if (options.length < 2 || options.length > 12 || options.some((option) => option.length > 250)) {
    return res.status(400).json({ success: false, message: "Add 2 to 12 options, each up to 250 characters" });
  }
  if (uniqueOptions.length !== options.length) {
    return res.status(400).json({ success: false, message: "Poll options must be unique" });
  }
  if (closesAt && (Number.isNaN(closesAt.getTime()) || closesAt.getTime() <= Date.now())) {
    return res.status(400).json({ success: false, message: "Closing time must be in the future" });
  }

  try {
    const pollId = await PollModel.create({
      companyId: companyIdFor(req), question, options,
      allowMultiple: Boolean(req.body?.allow_multiple),
      closesAt: closesAt ? closesAt.toISOString().slice(0, 19).replace("T", " ") : null,
      createdBy: req.user.user_id,
    });
    const polls = await PollModel.list(companyIdFor(req));
    return res.status(201).json({ success: true, message: "Poll published", data: polls.find((poll) => String(poll.poll_id) === String(pollId)) });
  } catch (error) {
    console.error("Unable to create poll:", error);
    return res.status(500).json({ success: false, message: "Unable to create poll" });
  }
};

exports.setStatus = async (req, res) => {
  const status = String(req.body?.status || "");
  if (!['published', 'closed'].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid poll status" });
  }
  try {
    const updated = await PollModel.setStatus(req.params.id, companyIdFor(req), status);
    return updated
      ? res.json({ success: true, message: status === "closed" ? "Poll closed" : "Poll reopened" })
      : res.status(404).json({ success: false, message: "Poll not found" });
  } catch (error) {
    console.error("Unable to update poll:", error);
    return res.status(500).json({ success: false, message: "Unable to update poll" });
  }
};

exports.remove = async (req, res) => {
  try {
    const removed = await PollModel.remove(req.params.id, companyIdFor(req));
    return removed
      ? res.json({ success: true, message: "Poll deleted" })
      : res.status(404).json({ success: false, message: "Poll not found" });
  } catch (error) {
    console.error("Unable to delete poll:", error);
    return res.status(500).json({ success: false, message: "Unable to delete poll" });
  }
};
