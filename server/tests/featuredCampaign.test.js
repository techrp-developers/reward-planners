const { test } = require("node:test");
const assert = require("node:assert/strict");

const statements = [];
let eligibleIds = [3, 5];
let campaignStatus = "draft";
let rollbacks = 0;
let commits = 0;
let connectionRequests = 0;
const connection = {
  async beginTransaction() {},
  async query(sql, params) {
    statements.push({ sql, params });
    if (sql.includes("SELECT campaign_type, module, status")) {
      return [[{ campaign_type: "featured", module: "product", status: campaignStatus }]];
    }
    if (sql.includes("SELECT p.product_id")) {
      return [eligibleIds.map((product_id) => ({ product_id }))];
    }
    return [{ affectedRows: 1 }];
  },
  async commit() { commits += 1; },
  async rollback() { rollbacks += 1; },
  release() {},
};

const dbPath = require.resolve("../config/database");
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    async query(sql) {
      statements.push({ sql, params: [] });
      if (sql.includes("FROM campaign_featured_products fp")) {
        return [[{ product_id: 9, display_order: 1 }, { product_id: 3, display_order: 2 }]];
      }
      return [[]];
    },
    async getConnection() {
      connectionRequests += 1;
      return connection;
    },
  },
};

const model = require("../models/campaignModel");

test("featured product saves deduplicate IDs and persist their exact order", async () => {
  statements.length = 0;
  eligibleIds = [9, 3];
  campaignStatus = "draft";
  const result = await model.saveFeaturedProducts(12, [9, 3, 9]);
  const insert = statements.find((entry) => entry.sql.includes("INSERT INTO campaign_featured_products"));
  assert.deepEqual(insert.params[0], [[12, 9, 1], [12, 3, 2]]);
  assert.deepEqual(result.map((product) => product.product_id), [9, 3]);
  assert.equal(commits, 1);
});

test("featured selection rejects invalid IDs without opening a transaction", async () => {
  const before = connectionRequests;
  await assert.rejects(model.saveFeaturedProducts(12, [0]), /positive integer IDs/);
  assert.equal(connectionRequests, before);
});

test("unavailable products roll back without replacing the saved selection", async () => {
  statements.length = 0;
  eligibleIds = [9];
  const before = rollbacks;
  await assert.rejects(model.saveFeaturedProducts(12, [9, 3]), /unavailable or not approved/);
  assert.equal(rollbacks, before + 1);
  assert.equal(statements.some((entry) => entry.sql.includes("DELETE FROM campaign_featured_products")), false);
});

test("an active featured campaign cannot have its last product removed", async () => {
  statements.length = 0;
  campaignStatus = "active";
  const before = rollbacks;
  await assert.rejects(model.saveFeaturedProducts(12, []), /Set the campaign to draft/);
  assert.equal(rollbacks, before + 1);
  assert.equal(statements.some((entry) => entry.sql.includes("DELETE FROM campaign_featured_products")), false);
  campaignStatus = "draft";
});
