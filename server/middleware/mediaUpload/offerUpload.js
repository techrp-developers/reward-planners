const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Absolute path like your main upload.js
const OFFER_UPLOAD_DIR = path.join(__dirname, "../../uploads/offer-posters");

// Ensure folder exists
if (!fs.existsSync(OFFER_UPLOAD_DIR)) {
  fs.mkdirSync(OFFER_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, OFFER_UPLOAD_DIR),
  filename: (req, file, cb) => {
    cb(null, `poster_${Date.now()}${path.extname(file.originalname)}`);
  },
});

exports.uploadPoster = multer({ storage });
