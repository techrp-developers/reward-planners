const assert = require("node:assert/strict");
const { test } = require("node:test");
const errorHandler = require("../middleware/errorHandler");

function run(error) {
  const res = {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const original = console.error;
  console.error = () => {};
  try {
    errorHandler(error, { method: "GET", originalUrl: "/v1/notification/preferences" }, res, () => {});
  } finally {
    console.error = original;
  }
  return res;
}

test("a refused MySQL connection (empty-message AggregateError) answers 503, not 500", () => {
  const refused = new AggregateError([
    Object.assign(new Error("connect ECONNREFUSED ::1:3306"), { code: "ECONNREFUSED" }),
    Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3306"), { code: "ECONNREFUSED" }),
  ], "");
  refused.code = "ECONNREFUSED";
  const res = run(refused);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "DATABASE_UNAVAILABLE");

  delete refused.code; // code only on the inner errors
  assert.equal(run(refused).statusCode, 503);
});

test("lost connections and auth/database misconfiguration are also reported as unavailable", () => {
  for (const code of ["PROTOCOL_CONNECTION_LOST", "ETIMEDOUT", "ER_ACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR"]) {
    assert.equal(run(Object.assign(new Error("x"), { code })).statusCode, 503, code);
  }
});

test("query and application errors stay 500 and never leak details outside development", () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const res = run(Object.assign(new Error("Unknown column 'secret'"), { code: "ER_BAD_FIELD_ERROR" }));
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, undefined);
    assert.equal(run(new TypeError("boom")).statusCode, 500);
  } finally {
    if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved;
  }
});
