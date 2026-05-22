const crypto = require("crypto");

//  Generate timestamp
const getTimestamp = () => Date.now().toString();

// const getAccessKeySigningKey = () => {
//   const accessKey = (process.env.EKO_ACCESS_KEY || "").trim();

//   if (!accessKey) {
//     throw new Error("EKO_ACCESS_KEY is missing");
//   }

//   // EKO requirement: use base64(access_key) as HMAC key material.
//   return Buffer.from(accessKey, "utf8").toString("base64");
// };

const getAccessKey = () => {
  const accessKey = (process.env.EKO_ACCESS_KEY || "").trim();

  if (!accessKey) {
    throw new Error("EKO_ACCESS_KEY is missing");
  }

  return accessKey;
};

//  Generate secret key: base64(HMAC_SHA256(timestamp, base64(access_key)))
// const generateSecretKey = (timestamp) => {
//   const signingKey = getAccessKeySigningKey();
//   return crypto
//     .createHmac("sha256", signingKey)
//     .update(timestamp)
//     .digest("base64");
// };

const generateSecretKey = (timestamp) => {
  const accessKey = getAccessKey();

  return crypto
    .createHmac("sha256", accessKey)
    .update(timestamp)
    .digest("base64");
};

// Generate request hash (for payBill)
// const generateRequestHash = (payloadString) => {
//   const signingKey = getAccessKeySigningKey();

//   return crypto
//     .createHmac("sha256", signingKey)
//     .update(payloadString)
//     .digest("base64");
// };

const generateRequestHash = (payloadString) => {
  const accessKey = getAccessKey();

  return crypto
    .createHmac("sha256", accessKey)
    .update(payloadString)
    .digest("base64");
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

  //  VERY IMPORTANT: payload string format
  const payloadString = `${utility_acc_no}|${amount}|${user_code}`;

  const request_hash = generateRequestHash(payloadString);

  const headers = {
    ...buildBaseHeaders(timestamp, secret_key),
    request_hash,
  };

  console.info("[BBPS][headers][pay]", {
    timestamp,
    secret_key,
    request_hash,
    payloadString,
    headers,
  });

  return headers;
};
