const crypto = require("crypto");

function generateOrderRef() {
  const ts = Date.now().toString(36).toUpperCase(); // e.g. LX2K4M
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase(); // e.g. A3F9B1

  return `ORD-${ts}-${rand}`;
}

module.exports = { generateOrderRef };
