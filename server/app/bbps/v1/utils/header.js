const crypto = require("crypto");

//  Generate timestamp
const getTimestamp = () => Date.now().toString();

const getAccessKeySigningKey = () => {
  const accessKey = (process.env.EKO_ACCESS_KEY || "").trim();

  if (!accessKey) {
    throw new Error("EKO_ACCESS_KEY is missing");
  }

  // EKO uses base64(access_key) as the HMAC key material.
  return Buffer.from(accessKey, "utf8").toString("base64");
};

//  Generate secret key: base64(HMAC_SHA256(timestamp, base64(access_key)))
const generateSecretKey = (timestamp) => {
  const signingKey = getAccessKeySigningKey();

  return crypto
    .createHmac("sha256", signingKey)
    .update(timestamp)
    .digest("base64");
};

// Generate request hash (for payBill)
const generateRequestHash = (payloadString) => {
  const signingKey = getAccessKeySigningKey();

  return crypto
    .createHmac("sha256", signingKey)
    .update(payloadString)
    .digest("base64");
};

const buildPayBillHashPayload = (
  timestamp,
  utilityAccNo,
  amount,
  userCode,
) => `${timestamp}${utilityAccNo}${amount}${userCode}`;

const formatPayBillAmount = (amount) => {
  const normalizedAmount = String(amount || "").trim();

  if (!normalizedAmount) {
    return normalizedAmount;
  }

  const numericAmount = Number(normalizedAmount);

  if (!Number.isFinite(numericAmount)) {
    return normalizedAmount;
  }

  return Number.isInteger(numericAmount)
    ? String(numericAmount)
    : numericAmount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

const buildBaseHeaders = (timestamp, secret_key) => ({
  "Content-Type": "application/json",
  developer_key: process.env.EKO_DEVELOPER_KEY,
  "secret-key": secret_key,
  "secret-key-timestamp": timestamp,
});

//  Common headers (for categories, operators, fetchBill)
exports.fetchHeaders = async () => {
  const timestamp = getTimestamp();
  const secret_key = generateSecretKey(timestamp);
  const headers = buildBaseHeaders(timestamp, secret_key);

  return headers;
};

//  PayBill headers (IMPORTANT)
exports.payHeaders = async (utility_acc_no, amount, user_code) => {
  const timestamp = getTimestamp();
  const secret_key = generateSecretKey(timestamp);
  const formattedAmount = formatPayBillAmount(amount);

  const payloadString = buildPayBillHashPayload(
    timestamp,
    utility_acc_no,
    formattedAmount,
    user_code,
  );

  const request_hash = generateRequestHash(payloadString);

  const headers = {
    ...buildBaseHeaders(timestamp, secret_key),
    request_hash,
  };

  return headers;
};

exports.formatPayBillAmount = formatPayBillAmount;
exports.buildPayBillHashPayload = buildPayBillHashPayload;
