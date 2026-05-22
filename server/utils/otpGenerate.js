const crypto = require("crypto");

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOTP(otp) {
  return crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
}

module.exports = { generateOTP, hashOTP };
