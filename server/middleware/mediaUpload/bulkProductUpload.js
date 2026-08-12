const multer = require("multer");

const bulkProductUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (/\.(xlsx|xls)$/i.test(file.originalname)) return callback(null, true);
    callback(new Error("Only Excel product templates (.xlsx or .xls) are supported"));
  },
});

module.exports = { bulkProductUpload };
