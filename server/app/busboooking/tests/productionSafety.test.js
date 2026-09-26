const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getProductionConfigurationErrors,
} = require("../config/productionSafety");

const productionEnv = {
  NODE_ENV: "production",
  SRDV_SEARCH_URL: "https://bus.example.com/v9/rest/Search",
  SRDV_SEAT_LAYOUT_URL: "https://bus.example.com/v9/rest/GetSeatLayOut",
  SRDV_BOARDING_DROPPING_URL: "https://bus.example.com/v9/rest/GetBoardingPointDetails",
  SRDV_BLOCK_URL: "https://bus.example.com/v9/rest/Block",
  SRDV_BOOK_URL: "https://bus.example.com/v9/rest/Book",
  SRDV_CANCEL_URL: "https://bus.example.com/v9/rest/Cancel",
  SRDV_BALANCE_URL: "https://bus.example.com/v9/rest/Balance",
  SRDV_API_TOKEN: "token",
  SRDV_CLIENT_ID: "client",
  SRDV_USERNAME: "user",
  SRDV_PASSWORD: "password",
  SRDV_END_USER_IP: "203.0.113.1",
  RAZOR_API_KEY: "rzp_live_example",
  RAZOR_SECRET_KEY: "secret",
  RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
  ACCESS_TOKEN_SECRET: "access-secret",
};

test("production configuration accepts HTTPS live endpoints and live payment keys", () => {
  assert.deepEqual(getProductionConfigurationErrors(productionEnv), []);
});

test("production configuration rejects test providers, test keys, and missing secrets", () => {
  const errors = getProductionConfigurationErrors({
    ...productionEnv,
    SRDV_SEARCH_URL: "https://bus.srdvtest.com/v9/rest/Search",
    RAZOR_API_KEY: "rzp_test_example",
    SRDV_API_TOKEN: "",
  });

  assert.ok(errors.some((error) => error.includes("SRDV_API_TOKEN is required")));
  assert.ok(errors.some((error) => error.includes("SRDV test host")));
  assert.ok(errors.some((error) => error.includes("Razorpay test key")));
});

test("non-production environments may intentionally use test services", () => {
  assert.deepEqual(
    getProductionConfigurationErrors({ NODE_ENV: "development" }),
    [],
  );
});
