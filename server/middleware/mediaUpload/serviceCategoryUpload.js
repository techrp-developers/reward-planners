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

  // filename: function (req, file, cb) {
  //   const ext = path.extname(file.originalname);
  //   cb(null, `icon${ext}`);
  // },

  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);

    cb(
      null,
      `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`,
    );
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];

  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only image files are allowed"), false);
  }

  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});
