const multer = require("multer");
const fs = require("fs");
const path = require("path");

const tempDir = path.join(__dirname, "../../uploads/temp");

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempDir);
  },

  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);

    cb(
      null,
      `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`,
    );
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/png",
    "image/jpeg",
    "image/webp",
  ];

  const allowedExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".webp"
  ];

  const ext = path.extname(file.originalname).toLowerCase();

  if (
    !allowedMimeTypes.includes(file.mimetype) ||
    !allowedExtensions.includes(ext)
  ) {
    return cb(new Error("Only image files are allowed"), false);
  }

  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});