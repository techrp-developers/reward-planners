const crypto = require("crypto");

function generateOTP() {
  const otp = crypto.randomInt(100000, 1000000).toString();
  const shouldLogOtp =
    process.env.NODE_ENV !== "production" ||
    String(process.env.LOG_OTP_TO_CONSOLE).toLowerCase() === "true";

  if (shouldLogOtp) {
    console.warn(`[DEV OTP] Generated OTP: ${otp}`);
  }

  return otp;
}

function hashOTP(otp) {
  return crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
}

module.exports = { generateOTP, hashOTP };
