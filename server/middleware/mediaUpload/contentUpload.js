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
    // Random suffix, not just Date.now() - a single request can carry multiple files
    // (e.g. Offers Banner's "images" field) that would otherwise collide on the same
    // millisecond and silently clobber each other's temp file.
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `content_${unique}${path.extname(file.originalname)}`);
  },
});

exports.uploadContentImage = multer({ storage });
