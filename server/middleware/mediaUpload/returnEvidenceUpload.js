const multer = require("multer");

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const allowedMimeTypes = ["video/mp4", "video/quicktime", "video/webm"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 5 },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Upload an MP4, MOV or WebM video"), false);
    }
  },
}).single("video");

// Checks the container signature so a renamed non-video file is rejected.
function isVideoBuffer(buffer) {
  const mp4OrMov = buffer.length > 12 && buffer.toString("ascii", 4, 8) === "ftyp";
  const webm = buffer.length > 4 && buffer.readUInt32BE(0) === 0x1a45dfa3;
  return mp4OrMov || webm;
}

function returnEvidenceUpload(req, res, next) {
  upload(req, res, (error) => {
    if (error) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      return res.status(tooLarge ? 413 : 400).json({
        success: false,
        message: tooLarge ? "Video must be no larger than 50 MB" : error.message,
      });
    }
    if (req.file && !isVideoBuffer(req.file.buffer)) {
      return res.status(400).json({
        success: false,
        message: "Upload an MP4, MOV or WebM video",
      });
    }
    next();
  });
}

module.exports = returnEvidenceUpload;
module.exports.isVideoBuffer = isVideoBuffer;
