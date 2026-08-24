const crypto = require("crypto");

function generateOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOTP(otp) {
  return crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
}

module.exports = { generateOTP, hashOTP };
