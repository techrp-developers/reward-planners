const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const tempFolder = path.join(__dirname, "../../uploads/temp");
if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempFolder);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, "_");
    cb(
      null,
      Date.now() + "-" + crypto.randomBytes(6).toString("hex") + "-" + safe,
    );
  },
});

const productUpload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/", "video/", "application/pdf"];

    if (allowedTypes.some((type) => file.mimetype.startsWith(type))) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"), false);
    }
  },
});

module.exports = { productUpload };
