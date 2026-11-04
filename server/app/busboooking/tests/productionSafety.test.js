const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getProductionConfigurationErrors,
  warnIfBusConfigurationIncomplete,
} = require("../config/productionSafety");
const {
  maskForLog,
  removeLegacyCredentials,
} = require("../utils/srdvClient");

const productionEnv = {
  NODE_ENV: "production",
  SRDV_SEARCH_URL: "https://bus.example.com/v9/rest/Search",
  SRDV_SEAT_LAYOUT_URL: "https://bus.example.com/v9/rest/GetSeatLayOut",
  SRDV_BOARDING_DROPPING_URL: "https://bus.example.com/v9/rest/GetBoardingPointDetails",
  SRDV_BLOCK_URL: "https://bus.example.com/v9/rest/Block",
  SRDV_BOOK_URL: "https://bus.example.com/v9/rest/Book",
  SRDV_BOOKING_DETAILS_URL: "https://bus.example.com/v9/BookingDetails",
  SRDV_CANCEL_URL: "https://bus.example.com/v9/rest/Cancel",
  SRDV_BALANCE_URL: "https://bus.example.com/v9/rest/Balance",
  SRDV_BALANCE_LOG_URL: "https://bus.example.com/v9/rest/BalanceLog",
  SRDV_API_TOKEN: "token",
  RAZOR_API_KEY: "rzp_live_example",
  RAZOR_SECRET_KEY: "secret",
  RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
  ACCESS_TOKEN_SECRET: "access-secret",
  SRDV_EXCHANGE_LOG: "false",
};

// The upgraded live API authenticates with the Api-Token header alone; the
// legacy ClientId/UserName/Password must not be required (or sent).
test("production configuration accepts HTTPS live endpoints and live payment keys", () => {
  assert.deepEqual(getProductionConfigurationErrors(productionEnv), []);
});

test("production configuration rejects test providers, test keys, and missing secrets", () => {
  const errors = getProductionConfigurationErrors({
    ...productionEnv,
    SRDV_SEARCH_URL: "https://bus.srdvtest.com/v9/rest/Search",
    RAZOR_API_KEY: "rzp_test_example",
    SRDV_API_TOKEN: "",
    SRDV_EXCHANGE_LOG: "true",
  });

  assert.ok(errors.some((error) => error.includes("SRDV_API_TOKEN is required")));
  assert.ok(errors.some((error) => error.includes("SRDV test host")));
  assert.ok(errors.some((error) => error.includes("Razorpay test key")));
  assert.ok(errors.some((error) => error.includes("SRDV_EXCHANGE_LOG")));
});

test("non-production environments may intentionally use test services", () => {
  assert.deepEqual(
    getProductionConfigurationErrors({ NODE_ENV: "development" }),
    [],
  );
});

test("new SRDV requests never send legacy authentication parameters", () => {
  const body = {
    ClientId: "legacy-client",
    Username: "legacy-user",
    UserName: "legacy-user-alternate-case",
    Password: "legacy-password",
    TraceId: "trace-1",
  };

  assert.deepEqual(removeLegacyCredentials(body), {
    TraceId: "trace-1",
  });
});

test("SRDV exchange logs mask secrets and passenger data case-insensitively", () => {
  assert.deepEqual(maskForLog({
    "api-token": "secret",
    Passengers: [{ firstName: "Test", PhoneNo: "9999999999", Age: 30 }],
  }), {
    "api-token": "***REDACTED***",
    Passengers: [{
      firstName: "***MASKED***",
      PhoneNo: "***MASKED***",
      Age: "***MASKED***",
    }],
  });
});

test("non-production startup warns with the names of missing bus settings, never values", () => {
  const logs = [];
  const missing = warnIfBusConfigurationIncomplete(
    { ...productionEnv, NODE_ENV: "development", SRDV_SEARCH_URL: "", SRDV_API_TOKEN: " " },
    (line) => logs.push(line),
  );
  assert.deepEqual(missing, ["SRDV_SEARCH_URL", "SRDV_API_TOKEN"]);
  assert.equal(logs.length, 1);
  assert.ok(logs[0].includes("SRDV_SEARCH_URL") && !logs[0].includes("access-secret"));
});

test("complete or production configuration produces no startup warning", () => {
  const logs = [];
  assert.deepEqual(warnIfBusConfigurationIncomplete({ ...productionEnv, NODE_ENV: "development" }, (l) => logs.push(l)), []);
  assert.deepEqual(warnIfBusConfigurationIncomplete({ NODE_ENV: "production" }, (l) => logs.push(l)), []);
  assert.equal(logs.length, 0);
});
