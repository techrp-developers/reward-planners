const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Absolute path (same pattern as offer)
const FLASH_UPLOAD_DIR = path.join(__dirname, "../../uploads/flash-banners");

// Ensure folder exists
if (!fs.existsSync(FLASH_UPLOAD_DIR)) {
  fs.mkdirSync(FLASH_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FLASH_UPLOAD_DIR),
  filename: (req, file, cb) => {
    cb(null, `flash_${Date.now()}${path.extname(file.originalname)}`);
  },
});

exports.uploadFlashBanner = multer({ storage });
