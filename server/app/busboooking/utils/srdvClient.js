const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Every SRDV call goes through this client. With SRDV_EXCHANGE_LOG=true each
// request/response pair is appended to logs/srdv/srdv-exchanges-<date>.jsonl,
// which SRDV asks for when verifying an integration. Credentials and passenger
// contact details are masked before anything is written.

const LOG_DIR = path.join(__dirname, "../../../logs/srdv");
const SECRET_KEYS = new Set(["password", "username", "api-token", "authorization"]);
const PERSONAL_KEYS = new Set([
  "phoneno",
  "email",
  "address",
  "idnumber",
  "idtype",
  "firstname",
  "lastname",
  "title",
  "gender",
  "age",
  "seatname",
  "gstcompanyaddress",
  "gstcompanyemail",
]);

const isEnabled = () =>
  String(process.env.SRDV_EXCHANGE_LOG || "").toLowerCase() === "true";

function mask(value) {
  if (Array.isArray(value)) return value.map(mask);
  if (!value || typeof value !== "object") return value;

  const copy = {};
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (SECRET_KEYS.has(normalizedKey)) copy[key] = "***REDACTED***";
    else if (PERSONAL_KEYS.has(normalizedKey)) copy[key] = item ? "***MASKED***" : item;
    else copy[key] = mask(item);
  }
  return copy;
}

function parseBody(data) {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function endpointName(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() || url;
  } catch {
    return String(url);
  }
}

function writeExchange(config, { status = null, data, error = null }) {
  if (!isEnabled() || !config) return;

  const startedAt = config.srdvStartedAt || Date.now();
  const entry = {
    timestamp: new Date(startedAt).toISOString(),
    endpoint: endpointName(config.url),
    method: String(config.method || "post").toUpperCase(),
    url: config.url,
    durationMs: Date.now() - startedAt,
    request: {
      headers: mask({
        "Content-Type": config.headers?.["Content-Type"],
        "Api-Token": config.headers?.["Api-Token"],
      }),
      body: mask(parseBody(config.data)),
    },
    response: {
      httpStatus: status,
      body: data === undefined ? null : mask(parseBody(data)),
    },
    error,
  };

  const file = path.join(
    LOG_DIR,
    `srdv-exchanges-${entry.timestamp.slice(0, 10)}.jsonl`,
  );
  fs.mkdir(LOG_DIR, { recursive: true }, (mkdirError) => {
    if (mkdirError) return;
    fs.appendFile(file, `${JSON.stringify(entry)}\n`, (writeError) => {
      if (writeError) {
        console.error("[SRDV] Exchange log write failed", writeError.message);
      }
    });
  });
}

const srdvClient = axios.create();

// The upgraded SRDV API authenticates with the Api-Token header only. Strip
// legacy credentials defensively so a stale environment or future call site
// can never send them to either the test or live provider.
const LEGACY_CREDENTIAL_KEYS = new Set([
  "clientid",
  "username",
  "password",
]);

function removeLegacyCredentials(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;

  for (const key of Object.keys(data)) {
    if (LEGACY_CREDENTIAL_KEYS.has(key.toLowerCase())) delete data[key];
  }
  return data;
}

srdvClient.interceptors.request.use((config) => {
  config.srdvStartedAt = Date.now();
  removeLegacyCredentials(config.data);
  return config;
});

srdvClient.interceptors.response.use(
  (response) => {
    writeExchange(response.config, {
      status: response.status,
      data: response.data,
    });
    return response;
  },
  (error) => {
    writeExchange(error.config, {
      status: error.response?.status ?? null,
      data: error.response?.data,
      error: error.code || error.message,
    });
    return Promise.reject(error);
  },
);

module.exports = srdvClient;
module.exports.maskForLog = mask;
module.exports.removeLegacyCredentials = removeLegacyCredentials;
