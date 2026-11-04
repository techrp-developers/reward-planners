// Employee notification inbox against a real, DISPOSABLE database.
//
//   RP_DISPOSABLE_DB_TESTS=1 node --test --test-force-exit tests/integration/notificationInbox.db.test.js
//
// Creates rp_test_inbox_<random> on the configured server, copies only the
// STRUCTURE of the tables involved, seeds synthetic rows and drops the database
// afterwards. Requests go over HTTP through the real router and auth middleware,
// because the bound-LIMIT failure only reproduces on a real MySQL 8 server.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const SERVER = path.join(__dirname, "../..");
require("dotenv").config({ path: path.join(SERVER, ".env"), quiet: true });
const mysql = require("mysql2/promise");

const ENABLED = process.env.RP_DISPOSABLE_DB_TESTS === "1";
const SOURCE_DB = process.env.DB_NAME || "rewardplanners_db";
const TEST_DB = `rp_test_inbox_${crypto.randomBytes(4).toString("hex")}`;
const SAFE_NAME = /^rp_test_inbox_[0-9a-f]{8}$/;
const LARGE = 3;
const OTHER = 9;
const EMPTY = 10;
const LARGE_COUNT = 145;

if (!ENABLED) {
  test("disposable-database inbox tests", { skip: "set RP_DISPOSABLE_DB_TESTS=1" }, () => {});
} else {
  let admin;
  let db;
  let server;
  let base;
  let jwt;

  const bearer = (userId, options = { expiresIn: "5m" }) =>
    jwt.sign({ user_id: userId, type: "access" }, process.env.ACCESS_TOKEN_SECRET, options);
  const inbox = async (query, token) => {
    const response = await fetch(`${base}/v1/notification/my-notification${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: response.status, body: await response.json() };
  };

  test.before(async () => {
    assert.match(TEST_DB, SAFE_NAME);
    assert.notEqual(TEST_DB, SOURCE_DB);
    admin = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
    });
    await admin.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4`);
    for (const table of ["customer", "notifications"]) {
      await admin.query(`CREATE TABLE \`${TEST_DB}\`.\`${table}\` LIKE \`${SOURCE_DB}\`.\`${table}\``);
    }
    await admin.query(`USE \`${TEST_DB}\``);
    await admin.query(
      `INSERT INTO customer (user_id, name, password, status) VALUES
       (${LARGE}, 'Large Inbox', 'x', 1), (${OTHER}, 'Other Employee', 'x', 1), (${EMPTY}, 'Empty Inbox', 'x', 1)`,
    );

    const rows = Array.from({ length: LARGE_COUNT }, (_, index) => [
      LARGE, "common", "test", `शीर्षक ${index}`, `संदेश ${index}`,
      JSON.stringify({ target_route: "Notification", index }), index % 2,
    ]);
    await admin.query("INSERT INTO notifications (user_id, module, type, title, message, metadata, is_read) VALUES ?", [rows]);
    await admin.query(
      `INSERT INTO notifications (user_id, module, type, title, message, metadata) VALUES
       (${OTHER}, 'common', 'test', 'Other title', 'Other message', NULL)`,
    );
    // Newest row, so it lands first on the first page.
    await admin.query(
      `INSERT INTO notifications (user_id, module, type, title, message, metadata) VALUES
       (${LARGE}, 'common', 'test', 'No metadata', 'Body', NULL)`,
    );

    process.env.DB_NAME = TEST_DB;
    db = require(path.join(SERVER, "config/database"));
    const [[{ name }]] = await db.query("SELECT DATABASE() AS name");
    assert.equal(name, TEST_DB, "application pool must use the disposable database");

    jwt = require(path.join(SERVER, "node_modules/jsonwebtoken"));
    const express = require(path.join(SERVER, "node_modules/express"));
    const app = express();
    app.use("/v1/notification", require(path.join(SERVER, "app/common/routes/notificationRoute")));
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  test.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (db) await db.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
      await admin.end();
    }
  });

  test("first page returns the employee's newest rows with the app's fields", async () => {
    const { status, body } = await inbox("?limit=20", bearer(LARGE));
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.length, 20);
    assert.deepEqual(Object.keys(body.data[1]).sort(), [
      "action_url", "created_at", "icon", "is_read", "message", "metadata", "module", "notification_id",
      "priority", "reference_id", "reference_type", "title", "type",
    ]);
    assert.equal(body.data[1].title, "शीर्षक 144");
    assert.deepEqual(body.data[1].metadata, { target_route: "Notification", index: 144 });
  });

  test("the table refuses malformed metadata, and null metadata does not fail the page", async () => {
    await assert.rejects(
      admin.query(`INSERT INTO notifications (user_id, module, type, title, message, metadata) VALUES (${LARGE}, 'common', 'test', 't', 'm', '{not json')`),
      { code: "ER_CHECK_CONSTRAINT_VIOLATED" },
    );
    const { status, body } = await inbox("?limit=20", bearer(LARGE));
    assert.equal(status, 200);
    assert.equal(body.data[0].title, "No metadata");
    assert.equal(body.data[0].metadata, null);
  });

  test("before_id walks the whole inbox with no gaps or repeats", async () => {
    const seen = [];
    let beforeId = null;
    for (;;) {
      const { status, body } = await inbox(`?limit=20${beforeId ? `&before_id=${beforeId}` : ""}`, bearer(LARGE));
      assert.equal(status, 200);
      seen.push(...body.data.map((row) => row.notification_id));
      if (body.data.length < 20) break;
      beforeId = body.data.at(-1).notification_id;
    }
    assert.equal(seen.length, LARGE_COUNT + 1);
    assert.equal(new Set(seen).size, seen.length);
    assert.deepEqual(seen, [...seen].sort((a, b) => b - a));
  });

  test("an empty inbox is a success with no rows", async () => {
    assert.deepEqual(await inbox("?limit=20", bearer(EMPTY)), { status: 200, body: { success: true, data: [] } });
  });

  test("each employee only ever sees their own rows", async () => {
    const { body } = await inbox("?limit=100", bearer(OTHER));
    assert.deepEqual(body.data.map((row) => row.title), ["Other title"]);
    // A user_id in the query string is ignored.
    const spoofed = await inbox(`?limit=100&user_id=${LARGE}`, bearer(OTHER));
    assert.deepEqual(spoofed.body.data.map((row) => row.title), ["Other title"]);
  });

  test("missing, invalid and expired tokens get 401", async () => {
    assert.equal((await inbox("?limit=20")).status, 401);
    assert.equal((await inbox("?limit=20", "not-a-token")).status, 401);
    assert.equal((await inbox("?limit=20", bearer(LARGE, { expiresIn: -10 }))).status, 401);
  });

  test("invalid paging gets 400, an oversized limit is capped", async () => {
    const token = bearer(LARGE);
    for (const query of ["?limit=abc", "?limit=0", "?limit=-1", "?limit=1.5", "?limit=", "?before_id=abc", "?before_id=0"]) {
      assert.equal((await inbox(query, token)).status, 400, query);
    }
    const capped = await inbox("?limit=1000", token);
    assert.equal(capped.status, 200);
    assert.equal(capped.body.data.length, 100);
  });
}
