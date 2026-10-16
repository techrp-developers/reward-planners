const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "app-settings-test-secret-only";
const initial = {
  id: 1, android_version: "1.0", android_version_code: 34,
  ios_version: "4.0.0", ios_version_code: 0,
  android_force_update: 0, ios_force_update: 0,
  maintenance_mode: 0, drain_mode: 0,
  maintenance_start_at: null, maintenance_end_at: null,
  company_name: "Existing company", address1: "Address", address2: null,
  company_email: "company@example.com", company_phone: "1234567890",
  created_at: "2026-01-01 00:00:00", updated_at: "2026-01-01 00:00:00",
};
let row, writes, server, base;
const dbPath = require.resolve("../config/database");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  async execute(sql, params = []) {
    if (sql.includes("FROM eusers")) return [[{
      user_id: params[0], role: params[0] === 1 ? "admin" : "customer", is_verified: 1,
    }]];
    if (sql.startsWith("UPDATE app_settings")) {
      writes++;
      const fields = [...sql.matchAll(/`(\w+)` = \?/g)].map(match => match[1]);
      assert.equal(params.at(-1), row.id);
      fields.forEach((field, index) => { row[field] = params[index]; });
      return [{ affectedRows: 1 }];
    }
    assert.match(sql, /FROM app_settings/);
    return [row ? [{ ...row }] : []];
  },
} };
const router = require("../app/common/routes/settingRoute");
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/v1/settings", router);
  server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/v1/settings/app-settings`;
});
after(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => { row = { ...initial }; writes = 0; });
async function request(method = "GET", body, userId) {
  const headers = { "Content-Type": "application/json" };
  if (userId) headers.Authorization = `Bearer ${jwt.sign({ user_id: userId, type: "access" }, process.env.JWT_SECRET)}`;
  const response = await fetch(base, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

test("public GET returns stored iOS values and all existing response fields", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true, data: initial });
  row.ios_version = "7.1.2";
  row.ios_version_code = 42;
  const changed = await request();
  assert.equal(changed.body.data.ios_version, "7.1.2");
  assert.equal(changed.body.data.ios_version_code, 42);
});

test("PATCH and PUT reject anonymous and non-admin writes", async () => {
  for (const method of ["PATCH", "PUT"]) {
    assert.equal((await request(method, { ios_version: "7.1" })).status, 401);
    assert.equal((await request(method, { ios_version: "7.1" }, 2)).status, 403);
  }
  assert.equal(writes, 0);
});

test("admin PATCH and PUT preserve Android and other settings and accept build strings", async () => {
  for (const method of ["PATCH", "PUT"]) {
    const response = await request(method, { ios_version: "7.1", ios_version_code: "42", ios_force_update: false }, 1);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, { ...initial, ios_version: "7.1", ios_version_code: 42 });
    assert.deepEqual((await request()).body.data, response.body.data);
  }
});

test("invalid versions, build numbers and force-update flags never write", async () => {
  for (const ios_version of [null, 6.2, "", "6..2", "6.2-beta", "6.2.1.4", "x", "1".repeat(21)]) {
    assert.equal((await request("PATCH", { ios_version }, 1)).status, 400);
  }
  for (const ios_version_code of [null, true, [], {}, "", "1e2", "1.5", 1.5, 0, -1, 2147483648]) {
    assert.equal((await request("PATCH", { ios_version_code }, 1)).status, 400);
  }
  assert.equal((await request("PATCH", { ios_force_update: 2 }, 1)).status, 400);
  assert.equal(writes, 0);
});

test("missing settings return 404 without inserting defaults", async () => {
  row = null;
  assert.equal((await request()).status, 404);
  assert.equal((await request("PATCH", { ios_version: "7.1" }, 1)).status, 404);
  assert.equal(writes, 0);
});
