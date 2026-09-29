const multer = require("multer");

const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!allowed.has(file.mimetype)) return callback(new Error("Chat images must be JPG, PNG, WebP, or GIF"));
    callback(null, true);
  },
});
