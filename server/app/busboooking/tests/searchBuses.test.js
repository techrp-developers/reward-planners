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
stub("../services/bookingService", {});
stub("../services/refundService", {});
stub("../../../services/alertService", {});
stub("../utils/srdvClient", {
  post: async (url, body, options) => { calls.provider.push({ url, body, options }); return { data: providerReply }; },
});
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
const validBody = { sourceCityCode: "1", destinationCityCode: "2", journeyDate: "2099-12-01" };

test("missing provider settings return 503 before any DB or provider call", async () => {
  calls.cityLookups = 0; calls.provider = [];
  const out = await withEnv({ NODE_ENV: "development", SRDV_SEARCH_URL: PROVIDER_ENV.SRDV_SEARCH_URL }, () => search(validBody));
  assert.equal(out.status, 503);
  assert.equal(out.body.code, "BUS_PROVIDER_NOT_CONFIGURED");
  assert.deepEqual(out.body.missingConfig, ["SRDV_API_TOKEN"]);
  assert.equal(calls.cityLookups, 0);
  assert.equal(calls.provider.length, 0);
});

test("production responses do not reveal which settings are missing", async () => {
  const out = await withEnv({ NODE_ENV: "production" }, () => search(validBody));
  assert.equal(out.status, 503);
  assert.equal(out.body.missingConfig, undefined);
});

test("date-only search returns every provider bus and ignores legacy journeyTime", async () => {
  calls.provider = [];
  providerReply = { TraceId: "t1", Error: { ErrorCode: 0 }, Result: [
    { DepartureTime: "2026-12-01T06:30:00" }, { DepartureTime: "2026-12-01T21:15:00" }, { DepartureTime: null },
  ] };
  const out = await withEnv({ ...PROVIDER_ENV, NODE_ENV: "development" }, () => search({ ...validBody, journeyTime: "18:00" }));
  assert.equal(out.status, 200);
  assert.equal(out.body.totalBusesFromProvider, 3);
  assert.equal(out.body.count, 3);
  assert.deepEqual(out.body.buses, providerReply.Result);
  assert.deepEqual(calls.provider[0].body, { FromCityCode: 1, ToCityCode: 2, DepartDate: validBody.journeyDate });
  assert.equal(calls.provider[0].options.headers["Api-Token"], "token");
});

test("future date without journeyTime succeeds; empty provider results are a valid 200", async () => {
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

test("past journey dates are rejected before database or provider calls", async () => {
  calls.cityLookups = 0; calls.provider = [];
  const out = await search({ ...validBody, journeyDate: "2000-01-01" });
  assert.equal(out.status, 400);
  assert.equal(out.body.message, "Journey date cannot be in the past");
  assert.equal(calls.cityLookups, 0);
  assert.equal(calls.provider.length, 0);
});

test("provider no-bus response succeeds without journeyTime", async () => {
  providerReply = { Error: { ErrorCode: 100, ErrorMessage: "No bus found" } };
  const out = await withEnv(PROVIDER_ENV, () => search(validBody));
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.buses, []);
  assert.equal(out.body.search.journeyDate, validBody.journeyDate);
});

test("provider error is reported as 400, not 500", async () => {
  providerReply = { Error: { ErrorCode: 2, ErrorMessage: "Invalid city" } };
  const out = await withEnv({ ...PROVIDER_ENV }, () => search(validBody));
  assert.equal(out.status, 400);
  assert.equal(out.body.message, "Invalid city");
});
