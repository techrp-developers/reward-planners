const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

// Stub everything the controller touches so search can run without MySQL,
// Razorpay or the SRDV network.
const stub = (relative, exports) => {
  const file = require.resolve(path.join(__dirname, relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
const calls = { cityLookups: 0, provider: [] };
let providerReply = null;
stub("../../../config/database", {});
stub("../../service/v1/middlewares/razorpay", {});
stub("../models/busModel", { getCityById: async (id) => { calls.cityLookups += 1; return { city_name: `City ${id}` }; } });
stub("../models/busBookingOrderModel", {});
const axiosPath = require.resolve("axios");
require.cache[axiosPath] = { id: axiosPath, filename: axiosPath, loaded: true, exports: {
  post: async (url, body, options) => { calls.provider.push({ url, body, options }); return { data: providerReply }; },
} };
const { searchBuses } = require("../controllers/busController");

const PROVIDER_ENV = {
  SRDV_SEARCH_URL: "https://provider.example/v9/rest/Search",
  SRDV_API_TOKEN: "token", SRDV_CLIENT_ID: "client", SRDV_USERNAME: "user", SRDV_PASSWORD: "pass",
};
const withEnv = async (env, fn) => {
  const saved = {};
  for (const key of [...Object.keys(PROVIDER_ENV), "NODE_ENV"]) { saved[key] = process.env[key]; delete process.env[key]; }
  Object.assign(process.env, env);
  try { return await fn(); } finally {
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : (process.env[key] = value);
  }
};
const search = async (body) => {
  const out = {};
  const res = { status(code) { out.status = code; return this; }, json(value) { out.body = value; return this; } };
  const originalError = console.error;
  console.error = () => {};
  try { await searchBuses({ body }, res); } finally { console.error = originalError; }
  return out;
};
const validBody = { sourceCityCode: "1", destinationCityCode: "2", journeyDate: "2026-12-01", journeyTime: "00:00" };

test("missing provider settings return 503 before any DB or provider call", async () => {
  calls.cityLookups = 0; calls.provider = [];
  const out = await withEnv({ NODE_ENV: "development", SRDV_SEARCH_URL: PROVIDER_ENV.SRDV_SEARCH_URL }, () => search(validBody));
  assert.equal(out.status, 503);
  assert.equal(out.body.code, "BUS_PROVIDER_NOT_CONFIGURED");
  assert.deepEqual(out.body.missingConfig, ["SRDV_API_TOKEN", "SRDV_CLIENT_ID", "SRDV_USERNAME", "SRDV_PASSWORD"]);
  assert.equal(calls.cityLookups, 0);
  assert.equal(calls.provider.length, 0);
});

test("production responses do not reveal which settings are missing", async () => {
  const out = await withEnv({ NODE_ENV: "production" }, () => search(validBody));
  assert.equal(out.status, 503);
  assert.equal(out.body.missingConfig, undefined);
});

test("configured search returns buses at or after the selected time", async () => {
  calls.provider = [];
  providerReply = { TraceId: "t1", Error: { ErrorCode: 0 }, Result: [
    { DepartureTime: "2026-12-01T06:30:00" }, { DepartureTime: "2026-12-01T21:15:00" }, { DepartureTime: null },
  ] };
  const out = await withEnv({ ...PROVIDER_ENV, NODE_ENV: "development" }, () => search({ ...validBody, journeyTime: "18:00" }));
  assert.equal(out.status, 200);
  assert.equal(out.body.totalBusesFromProvider, 3);
  assert.equal(out.body.count, 1);
  assert.equal(out.body.buses[0].DepartureTime, "2026-12-01T21:15:00");
  assert.equal(calls.provider[0].body.DepartDate, "2026-12-01");
  assert.equal(calls.provider[0].options.headers["Api-Token"], "token");
});

test("future date with 00:00 keeps every bus that day; empty provider results are a valid 200", async () => {
  providerReply = { Error: { ErrorCode: 0 }, Result: [{ DepartureTime: "2026-12-01T00:05:00" }] };
  let out = await withEnv({ ...PROVIDER_ENV }, () => search(validBody));
  assert.equal(out.status, 200);
  assert.equal(out.body.count, 1);
  providerReply = { Error: { ErrorCode: 0 }, Result: [] };
  out = await withEnv({ ...PROVIDER_ENV }, () => search(validBody));
  assert.equal(out.status, 200);
  assert.equal(out.body.success, true);
  assert.deepEqual(out.body.buses, []);
});

test("provider error is reported as 400, not 500", async () => {
  providerReply = { Error: { ErrorCode: 2, ErrorMessage: "Invalid city" } };
  const out = await withEnv({ ...PROVIDER_ENV }, () => search(validBody));
  assert.equal(out.status, 400);
  assert.equal(out.body.message, "Invalid city");
});
