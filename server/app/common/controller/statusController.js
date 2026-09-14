const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const StatusModel = require("../models/statusModel");
const { uploadToR2 } = require("../../../utils/r2upload");
const { deleteFromR2 } = require("../../../utils/r2delete");
const { getPublicUrl } = require("../../../utils/publicUrl");

const VIDEO_MAX_SECONDS = 30;
const TEXT_MAX_LENGTH = 700;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const VISIBILITIES = new Set([
  "same_company", "all_companies", "all_except_companies", "custom_people",
]);

function parseIdList(value, fieldName) {
  if (value === undefined || value === null || value === "") return [];
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { parsed = value.split(","); }
  }
  if (!Array.isArray(parsed)) throw new Error(`${fieldName} must be an array of IDs`);
  const ids = parsed.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error(`${fieldName} contains an invalid ID`);
  }
  return [...new Set(ids)];
}

function removeTemp(file) {
  if (file?.path) fs.promises.unlink(file.path).catch(() => {});
}

function videoDuration(filePath) {
  return new Promise((resolve, reject) => {
    // ffmpeg-static does not bundle ffprobe. `ffmpeg -i` still reads the
    // container metadata without transcoding; it exits non-zero because no
    // output is supplied, so duration is parsed from stderr in either case.
    execFile(ffmpegPath, ["-hide_banner", "-i", filePath], { timeout: 15000 }, (error, _stdout, stderr) => {
      const match = String(stderr).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
      if (!match) return reject(error || new Error("Could not read video duration"));
      resolve(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
    });
  });
}

function serialize(row) {
  if (!row) return row;
  return {
    id: row.status_id,
    user: { id: row.user_id, name: row.user_name, image_url: getPublicUrl(row.user_image) },
    type: row.type,
    text: row.text_content,
    background_color: row.background_color,
    font_style: row.font_style,
    media_url: getPublicUrl(row.media_key),
    media_mime_type: row.media_mime_type,
    duration_seconds: row.media_duration_seconds,
    visibility: row.visibility,
    viewed: Boolean(Number(row.viewed || 0)),
    view_count: row.view_count === undefined ? undefined : Number(row.view_count),
    created_at: row.created_at,
    expires_at: row.expires_at,
  };
}

exports.create = async (req, res) => {
  let uploadedKey = null;
  try {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const inferredType = req.file?.mimetype.startsWith("video/") ? "video" : req.file ? "image" : "text";
    const type = req.body.type || inferredType;
    const visibility = req.body.visibility || "same_company";
    let excludedCompanyIds;
    let allowedUserIds;
    try {
      excludedCompanyIds = parseIdList(req.body.excluded_company_ids, "excluded_company_ids");
      allowedUserIds = parseIdList(req.body.allowed_user_ids, "allowed_user_ids");
    } catch (error) {
      return res.status(422).json({ success: false, message: error.message });
    }

    if (!VISIBILITIES.has(visibility)) {
      return res.status(422).json({ success: false, message: "Invalid status visibility" });
    }
    if (visibility === "all_except_companies" && !excludedCompanyIds.length) {
      return res.status(422).json({ success: false, message: "Select at least one excluded company" });
    }
    if (visibility === "custom_people" && !allowedUserIds.length) {
      return res.status(422).json({ success: false, message: "Select at least one allowed user" });
    }
    if (visibility !== "all_except_companies") excludedCompanyIds = [];
    if (visibility !== "custom_people") allowedUserIds = [];

    if (!['text', 'image', 'video'].includes(type)) {
      return res.status(422).json({ success: false, message: "type must be text, image, or video" });
    }
    if ((type === "image" || type === "video") && !req.file) {
      return res.status(422).json({ success: false, message: "media file is required" });
    }
    if (type === "text" && (req.file || !text)) {
      return res.status(422).json({ success: false, message: "A text status requires text and cannot contain media" });
    }
    if (text.length > TEXT_MAX_LENGTH) {
      return res.status(422).json({ success: false, message: `text cannot exceed ${TEXT_MAX_LENGTH} characters` });
    }
    if (req.file && !req.file.mimetype.startsWith(`${type}/`)) {
      return res.status(422).json({ success: false, message: `Uploaded file does not match type ${type}` });
    }

    const backgroundColor = req.body.background_color || (type === "text" ? "#202C33" : null);
    if (backgroundColor && !HEX_COLOR.test(backgroundColor)) {
      return res.status(422).json({ success: false, message: "background_color must use #RRGGBB format" });
    }

    let duration = null;
    if (type === "video") {
      duration = await videoDuration(req.file.path);
      if (!duration || duration > VIDEO_MAX_SECONDS) {
        return res.status(422).json({ success: false, message: `Video must be ${VIDEO_MAX_SECONDS} seconds or shorter` });
      }
    }

    if (req.file) {
      const extension = path.extname(req.file.originalname).toLowerCase();
      uploadedKey = `statuses/${req.user.user_id}/${crypto.randomUUID()}${extension}`;
      await uploadToR2(await fs.promises.readFile(req.file.path), uploadedKey, req.file.mimetype);
    }

    const status = await StatusModel.create({
      userId: req.user.user_id, type, textContent: text || null,
      backgroundColor, fontStyle: req.body.font_style || null,
      mediaKey: uploadedKey, mediaMimeType: req.file?.mimetype || null,
      mediaDurationSeconds: duration ? Math.ceil(duration) : null,
      visibility, excludedCompanyIds, allowedUserIds,
    });
    return res.status(201).json({ success: true, data: serialize(status) });
  } catch (error) {
    if (uploadedKey) await deleteFromR2(uploadedKey).catch(() => {});
    console.error("Create status error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : "Failed to create status",
    });
  } finally {
    removeTemp(req.file);
  }
};

exports.mine = async (req, res) => {
  try {
    const rows = await StatusModel.getMine(req.user.user_id);
    return res.json({ success: true, data: rows.map(serialize) });
  } catch (error) {
    console.error("Get own statuses error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch statuses" });
  }
};

exports.audienceOptions = async (req, res) => {
  try {
    const data = await StatusModel.getAudienceOptions(req.user.user_id, req.query.q);
    return res.json({
      success: true,
      data: {
        companies: data.companies.map((company) => ({
          id: company.id,
          name: company.name,
          logo_url: getPublicUrl(company.company_logo),
        })),
        people: data.people.map((person) => ({
          id: person.id,
          name: person.name,
          image_url: getPublicUrl(person.user_image),
          company: { id: person.company_id, name: person.company_name },
        })),
      },
    });
  } catch (error) {
    console.error("Get status audience options error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch audience options" });
  }
};

exports.feed = async (req, res) => {
  try {
    const userIds = String(req.query.user_ids || "").split(",").filter(Boolean)
      .map(Number).filter(Number.isSafeInteger).filter((id) => id > 0);
    const rows = await StatusModel.getFeed(req.user.user_id, [...new Set(userIds)]);
    const grouped = [];
    const users = new Map();
    for (const row of rows) {
      if (!users.has(row.user_id)) {
        const group = { user: serialize(row).user, has_unviewed: false, statuses: [] };
        users.set(row.user_id, group); grouped.push(group);
      }
      const item = serialize(row);
      users.get(row.user_id).has_unviewed ||= !item.viewed;
      users.get(row.user_id).statuses.push(item);
    }
    return res.json({ success: true, data: grouped });
  } catch (error) {
    console.error("Get status feed error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch status feed" });
  }
};

exports.view = async (req, res) => {
  try {
    const status = await StatusModel.markViewed(req.params.status_id, req.user.user_id);
    if (!status) return res.status(404).json({ success: false, message: "Status not found or expired" });
    return res.json({ success: true, message: "Status viewed" });
  } catch (error) {
    console.error("View status error:", error);
    return res.status(500).json({ success: false, message: "Failed to record view" });
  }
};

exports.views = async (req, res) => {
  try {
    const rows = await StatusModel.getViews(req.params.status_id, req.user.user_id);
    if (!rows) return res.status(404).json({ success: false, message: "Status not found" });
    return res.json({ success: true, data: rows.map((row) => ({ ...row, image_url: getPublicUrl(row.user_image), user_image: undefined })) });
  } catch (error) {
    console.error("Get status views error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch status views" });
  }
};

exports.remove = async (req, res) => {
  try {
    const status = await StatusModel.softDelete(req.params.status_id, req.user.user_id);
    if (!status) return res.status(404).json({ success: false, message: "Status not found" });
    if (status.media_key) await deleteFromR2(status.media_key).catch((error) => console.error("Delete status media error:", error));
    return res.json({ success: true, message: "Status deleted" });
  } catch (error) {
    console.error("Delete status error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete status" });
  }
};
