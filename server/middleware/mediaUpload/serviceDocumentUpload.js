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

  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

//  Flexible file filter
const fileFilter = (req, file, cb) => {
  // Allow everything except dangerous executables
  const blockedTypes = [
    "application/x-msdownload", // .exe
    "application/x-sh",         // shell scripts
  ];

  if (blockedTypes.includes(file.mimetype)) {
    return cb(new Error("File type not allowed"), false);
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