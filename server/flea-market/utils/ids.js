const crypto = require("crypto");

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function generateOtpSessionId() {
  return crypto.randomBytes(16).toString("hex");
}

function generateNumericOtp(length = 6) {
  const max = 10 ** length;
  return crypto.randomInt(0, max).toString().padStart(length, "0");
}

function generateInvoiceNumber(locationId) {
  return `FM-${locationId}-${Date.now()}-${crypto.randomInt(100, 999)}`;
}

module.exports = { generateSessionToken, generateOtpSessionId, generateNumericOtp, generateInvoiceNumber };
