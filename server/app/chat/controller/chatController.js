const Chat = require("../models/chatModel");
const crypto = require("crypto");
const path = require("path");
const sharp = require("sharp");
const { uploadToR2 } = require("../../../utils/r2upload");
const { getPublicUrl } = require("../../../utils/publicUrl");

const ids = (value) => Array.isArray(value) ? [...new Set(value.map(Number).filter(Number.isSafeInteger).filter((id) => id > 0))] : [];
const fail = (res, error) => res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Internal server error" });

exports.users = async (req, res) => {
  try { res.json({ success: true, data: await Chat.companyUsers(req.user.user_id, String(req.query.search || "").trim().slice(0, 100)) }); }
  catch (error) { fail(res, error); }
};

exports.presence = async (req, res) => {
  try {
    const userIds = ids(String(req.query.user_ids || "").split(","));
    if (!userIds.length || userIds.length > 100) return res.status(422).json({ success: false, message: "Provide 1-100 user_ids" });
    const rows = await Chat.presence(req.user.user_id, userIds);
    const online = req.app.locals.chatSocket?.onlineUserIds() || new Set();
    res.json({ success: true, data: rows.map((row) => ({
      user_id: row.user_id,
      online: online.has(Number(row.user_id)),
      last_seen_at: row.last_seen_at,
    })) });
  } catch (error) { fail(res, error); }
};

exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(422).json({ success: false, message: "An image field is required" });
    const me = await Chat.identity(req.user.user_id);
    if (!me) return res.status(403).json({ success: false, message: "An active company membership is required" });
    let output;
    try {
      output = await sharp(req.file.buffer, { animated: false, limitInputPixels: 40_000_000 })
        .rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 }).toBuffer();
    } catch { return res.status(422).json({ success: false, message: "The uploaded file is not a valid image" }); }
    const key = `chat/${me.company_id}/${req.user.user_id}/${crypto.randomUUID()}.webp`;
    await uploadToR2(output, key, "image/webp");
    res.status(201).json({ success: true, data: {
      attachment_url: getPublicUrl(key), attachment_name: req.file.originalname,
      attachment_mime_type: "image/webp", size: output.length,
    } });
  } catch (error) { fail(res, error); }
};

exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(422).json({ success: false, message: "A document field is required" });
    const me = await Chat.identity(req.user.user_id);
    if (!me) return res.status(403).json({ success: false, message: "An active company membership is required" });
    const extension = path.extname(req.file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 12);
    const key = `chat/${me.company_id}/${req.user.user_id}/documents/${crypto.randomUUID()}${extension}`;
    await uploadToR2(req.file.buffer, key, req.file.mimetype);
    res.status(201).json({ success: true, data: {
      attachment_url: getPublicUrl(key), attachment_name: path.basename(req.file.originalname).slice(0, 255),
      attachment_mime_type: req.file.mimetype, size: req.file.size,
    } });
  } catch (error) { fail(res, error); }
};

exports.createPoll = async (req, res) => {
  try {
    const question = typeof req.body.question === "string" ? req.body.question.trim() : "";
    const options = Array.isArray(req.body.options)
      ? [...new Set(req.body.options.map((option) => String(option).trim()).filter(Boolean))] : [];
    if (!question || question.length > 500) return res.status(422).json({ success: false, message: "Poll question must contain 1-500 characters" });
    if (options.length < 2 || options.length > 10 || options.some((option) => option.length > 250)) {
      return res.status(422).json({ success: false, message: "Provide 2-10 unique options of up to 250 characters" });
    }
    let closesAt = null;
    if (req.body.closes_at) {
      closesAt = new Date(req.body.closes_at);
      if (!Number.isFinite(closesAt.getTime()) || closesAt.getTime() <= Date.now()) return res.status(422).json({ success: false, message: "closes_at must be a future date" });
    }
    const conversationId = Number(req.params.id);
    const message = await Chat.createPoll(req.user.user_id, conversationId, {
      question, options, allowMultiple: req.body.allow_multiple === true,
      closesAt, clientMessageId: req.body.client_message_id ? String(req.body.client_message_id).slice(0, 64) : null,
    });
    req.app.locals.chatSocket?.broadcastConversation(conversationId, { type: "message:new", data: message });
    res.status(201).json({ success: true, data: message });
  } catch (error) { fail(res, error); }
};

exports.votePoll = async (req, res) => {
  try {
    const optionIds = ids(req.body.option_ids);
    if (!optionIds.length || optionIds.length > 10) return res.status(422).json({ success: false, message: "Select at least one valid option" });
    const result = await Chat.votePoll(req.user.user_id, Number(req.params.pollId), optionIds);
    const publicPoll = {
      ...result.message.poll,
      options: result.message.poll.options.map(({ selected_by_me, ...option }) => option),
    };
    req.app.locals.chatSocket?.broadcastConversation(result.conversationId, {
      type: "poll:updated",
      data: { message_id: result.message.message_id, poll: publicPoll, voter_id: req.user.user_id, option_ids: optionIds },
    });
    res.json({ success: true, data: result.message.poll });
  } catch (error) { fail(res, error); }
};

exports.create = async (req, res) => {
  try {
    const type = req.body.type;
    const memberIds = ids(req.body.member_ids);
    if (!["direct", "group"].includes(type)) return res.status(422).json({ success: false, message: "type must be direct or group" });
    if (type === "group" && (!String(req.body.name || "").trim() || String(req.body.name).trim().length > 120)) return res.status(422).json({ success: false, message: "A group name of 1-120 characters is required" });
    const conversationId = await Chat.createConversation(req.user.user_id, {
      type, memberIds, name: String(req.body.name || "").trim(), description: String(req.body.description || "").trim().slice(0, 500),
    });
    req.app.locals.chatSocket?.addUsersToConversation([req.user.user_id, ...memberIds], conversationId);
    res.status(201).json({ success: true, data: { conversation_id: conversationId } });
  } catch (error) { fail(res, error); }
};

exports.list = async (req, res) => {
  try { res.json({ success: true, data: await Chat.listConversations(req.user.user_id) }); } catch (error) { fail(res, error); }
};

exports.messages = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const before = req.query.before_id ? Number(req.query.before_id) : null;
    res.json({ success: true, data: await Chat.messages(req.user.user_id, Number(req.params.id), before, limit) });
  } catch (error) { fail(res, error); }
};

exports.send = async (req, res) => {
  try {
    const messageType = req.body.message_type || "text";
    const body = typeof req.body.body === "string" ? req.body.body.trim() : "";
    if (!["text", "image", "file"].includes(messageType)) return res.status(422).json({ success: false, message: "Invalid message_type" });
    if (messageType === "text" && (!body || body.length > 5000)) return res.status(422).json({ success: false, message: "Text messages must contain 1-5000 characters" });
    if (messageType !== "text" && !req.body.attachment_url) return res.status(422).json({ success: false, message: "attachment_url is required" });
    const message = await Chat.sendMessage(req.user.user_id, Number(req.params.id), {
      messageType, body, attachmentUrl: req.body.attachment_url, attachmentName: req.body.attachment_name,
      attachmentMimeType: req.body.attachment_mime_type, replyTo: req.body.reply_to_message_id ? Number(req.body.reply_to_message_id) : null,
      clientMessageId: req.body.client_message_id ? String(req.body.client_message_id).slice(0, 64) : null,
    });
    req.app.locals.chatSocket?.broadcastConversation(Number(req.params.id), { type: "message:new", data: message });
    res.status(201).json({ success: true, data: message });
  } catch (error) { fail(res, error); }
};

exports.read = async (req, res) => {
  try {
    const conversationId = Number(req.params.id), messageId = Number(req.body.message_id);
    await Chat.markRead(req.user.user_id, conversationId, messageId);
    const event = { type: "message:read", data: { conversation_id: conversationId, message_id: messageId, user_id: req.user.user_id } };
    req.app.locals.chatSocket?.broadcastConversation(conversationId, event);
    res.json({ success: true });
  } catch (error) { fail(res, error); }
};

exports.updateGroup = async (req, res) => {
  try { await Chat.updateGroup(req.user.user_id, Number(req.params.id), req.body); res.json({ success: true }); } catch (error) { fail(res, error); }
};

exports.updateTheme = async (req, res) => {
  try {
    const themes = new Set(["default", "violet", "ocean", "forest", "sunset"]);
    const themeKey = String(req.body.theme_key || "").trim().toLowerCase();
    if (!themes.has(themeKey)) {
      return res.status(422).json({ success: false, message: "Invalid chat theme" });
    }
    const conversationId = Number(req.params.id);
    const data = await Chat.setTheme(req.user.user_id, conversationId, themeKey);
    req.app.locals.chatSocket?.broadcastConversation(conversationId, {
      type: "conversation:theme",
      data,
    });
    res.json({ success: true, data });
  } catch (error) { fail(res, error); }
};
exports.addMembers = async (req, res) => {
  try {
    const memberIds = ids(req.body.member_ids), conversationId = Number(req.params.id);
    await Chat.addMembers(req.user.user_id, conversationId, memberIds);
    req.app.locals.chatSocket?.addUsersToConversation(memberIds, conversationId);
    res.json({ success: true });
  } catch (error) { fail(res, error); }
};
exports.removeMember = async (req, res) => {
  try {
    const conversationId = Number(req.params.id), targetId = Number(req.params.userId);
    await Chat.removeMember(req.user.user_id, conversationId, targetId);
    req.app.locals.chatSocket?.removeUserFromConversation(targetId, conversationId);
    res.json({ success: true });
  } catch (error) { fail(res, error); }
};
exports.leave = async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    await Chat.removeMember(req.user.user_id, conversationId, req.user.user_id);
    req.app.locals.chatSocket?.removeUserFromConversation(req.user.user_id, conversationId);
    res.json({ success: true });
  } catch (error) { fail(res, error); }
};
