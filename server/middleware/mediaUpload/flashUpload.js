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
    const extension = path.extname(path.basename(file.originalname)).toLowerCase();
    const safeExtension = /^\.[a-z0-9]{1,6}$/.test(extension) ? extension : ".img";
    cb(null, `campaign-${require("crypto").randomUUID()}${safeExtension}`);
  },
});

exports.uploadFlashBanner = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
exports.uploadCampaignImage = (req, res, next) => {
  exports.uploadFlashBanner.single("banner_image")(req, res, (error) => {
    if (!error) return next();
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 400).json({
      success: false,
      message: tooLarge ? "Campaign images must be no larger than 5 MB" : "Unable to upload campaign image",
    });
  });
};
