const multer = require("multer");
const path = require("path");
const fs = require("fs");

const CONTENT_UPLOAD_DIR = path.join(__dirname, "../../uploads/content-images");

if (!fs.existsSync(CONTENT_UPLOAD_DIR)) {
  fs.mkdirSync(CONTENT_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CONTENT_UPLOAD_DIR),
  filename: (req, file, cb) => {
    cb(null, `content_${Date.now()}${path.extname(file.originalname)}`);
  },
});

exports.uploadContentImage = multer({ storage });
