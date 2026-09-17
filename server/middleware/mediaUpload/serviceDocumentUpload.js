const multer = require("multer");
const fs = require("fs");
const path = require("path");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join(__dirname, "../../uploads/temp");

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    cb(null, tempDir);
  },

  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const allowedMimeTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic",
  "video/mp4", "video/quicktime", "video/webm",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "text/comma-separated-values",
  "application/octet-stream",
]);

const allowedExtensions = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".heic",
  ".mp4", ".mov", ".webm", ".pdf", ".doc", ".docx",
  ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv",
]);

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname || "").toLowerCase();

  if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(extension)) {
    return cb(new Error("Unsupported document type"), false);
  }

  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});
