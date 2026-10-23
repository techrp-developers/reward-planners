const PROVIDER_URL_KEYS = [
  "SRDV_SEARCH_URL",
  "SRDV_SEAT_LAYOUT_URL",
  "SRDV_BOARDING_DROPPING_URL",
  "SRDV_BLOCK_URL",
  "SRDV_BOOK_URL",
  "SRDV_CANCEL_URL",
  "SRDV_BALANCE_URL",
  "SRDV_BALANCE_LOG_URL",
];

const REQUIRED_KEYS = [
  ...PROVIDER_URL_KEYS,
  "SRDV_API_TOKEN",
  "SRDV_END_USER_IP",
  "RAZOR_API_KEY",
  "RAZOR_SECRET_KEY",
  "RAZORPAY_WEBHOOK_SECRET",
  "ACCESS_TOKEN_SECRET",
];

function getProductionConfigurationErrors(env) {
  if (String(env.NODE_ENV).toLowerCase() !== "production") return [];

  const errors = [];
  for (const key of REQUIRED_KEYS) {
    if (!String(env[key] || "").trim()) errors.push(`${key} is required`);
  }

  for (const key of PROVIDER_URL_KEYS) {
    const value = String(env[key] || "").trim();
    if (!value) continue;

    try {
      const url = new URL(value);
      if (url.protocol !== "https:") errors.push(`${key} must use HTTPS`);
      if (/srdvtest/i.test(url.hostname)) {
        errors.push(`${key} must not use the SRDV test host`);
      }
    } catch {
      errors.push(`${key} must be a valid absolute URL`);
    }
  }

  if (/^rzp_test_/i.test(String(env.RAZOR_API_KEY || ""))) {
    errors.push("RAZOR_API_KEY must not be a Razorpay test key");
  }

  return errors;
}

// Names of required bus-booking settings that are empty. Values are never returned.
function getMissingBusConfiguration(env = process.env) {
  return REQUIRED_KEYS.filter((key) => !String(env[key] || "").trim());
}

// Outside production the server still starts, but say loudly why bus booking
// will fail, instead of surfacing only as a 5xx on the first search.
function warnIfBusConfigurationIncomplete(env = process.env, log = console.warn) {
  if (String(env.NODE_ENV).toLowerCase() === "production") return [];
  const missing = getMissingBusConfiguration(env);
  if (missing.length) {
    log(`[BusBooking] Provider configuration incomplete (NODE_ENV=${env.NODE_ENV || "unset"}); missing: ${missing.join(", ")}`);
  }
  return missing;
}

function assertProductionConfiguration(env = process.env) {
  const errors = getProductionConfigurationErrors(env);
  if (errors.length) {
    throw new Error(`Unsafe bus-booking production configuration: ${errors.join("; ")}`);
  }
}

module.exports = {
  getProductionConfigurationErrors,
  getMissingBusConfiguration,
  warnIfBusConfigurationIncomplete,
  assertProductionConfiguration,
};
