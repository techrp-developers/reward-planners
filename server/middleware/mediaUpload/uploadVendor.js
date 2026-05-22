const multer = require("multer");
const fs = require("fs");
const path = require("path");

const vendorStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = path.join(__dirname, "../../uploads/vendors/temp");

    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }

    cb(null, folder);
  },

  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});

const uploadVendor = multer({ storage: vendorStorage });

module.exports = uploadVendor;
