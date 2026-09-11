const multer = require("multer");

// Content assets are uploaded directly from memory to Cloudflare R2. This avoids
// making the API server's ephemeral filesystem the source of truth.
exports.uploadContentImage = multer({ storage: multer.memoryStorage() });
