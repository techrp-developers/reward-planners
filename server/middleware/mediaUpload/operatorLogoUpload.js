const multer = require("multer");

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const operatorLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024,
    files: 1,
    fields: 5,
  },
  fileFilter: (_req, file, callback) => {
    if (file.fieldname === "logo" && ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return callback(null, true);
    }

    return callback(
      new Error("Upload one PNG, JPEG, or WebP file in the logo field"),
    );
  },
});

module.exports = operatorLogoUpload;
