const multer = require("multer");
const fs = require("fs");
const path = require("path");

const tempDir = path.join(__dirname, "../../uploads/temp/statuses");
fs.mkdirSync(tempDir, { recursive: true });

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
]);

module.exports = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tempDir),
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (!allowedTypes.has(file.mimetype)) {
      return cb(new Error("Status media must be a JPG, PNG, WebP, MP4, or MOV file"));
    }
    cb(null, true);
  },
  limits: { files: 1, fileSize: 25 * 1024 * 1024 },
});
