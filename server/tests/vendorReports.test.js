const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { vendorOrderReport } = require("../utils/vendorReportData");

test("vendor revenue and sold units exclude unpaid and cancelled lines", async () => {
  const base = { order_status: "paid", shipping_status: "delivered", item_count: 2, active_items: 1, active_item_value: "120.25", active_units: "3" };
  const db = { execute: async (sql, params) => {
    assert.match(sql, /WHERE vo.vendor_id = \?/);
    assert.deepEqual(params, [42]);
    assert.match(sql, /SELECT MAX\(latest.id\)/);
    assert.match(sql, /FROM eorder_items GROUP BY vendor_order_id/);
    return [[base, { ...base, order_status: "pending_payment" }, { ...base, active_items: 0 }]];
  } };
  const report = await vendorOrderReport(db, 42);
  assert.deepEqual(report.summary, { totalOrders: 3, revenue: 120.25, units: 3, delivered: 1 });
  const cancelled = await vendorOrderReport(db, 42, [], [], "cancelled");
  assert.deepEqual(cancelled.summary, { totalOrders: 1, revenue: 0, units: 0, delivered: 0 });
});

function controller(db) {
  const sandbox = { module: { exports: {} }, console, require: (name) => {
    if (name === "../config/database") return db;
    return require(name);
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../controllers/vendorReportController"), "utf8"), sandbox);
  return sandbox.module.exports;
}

test("product report counts products once and sums all variant units", async () => {
  const handler = controller({ execute: async (sql, params) => {
    assert.match(sql, /p.is_deleted = 0/);
    assert.match(sql, /created_via.*flea_market_quick_create/);
    assert.equal(params[0], 42);
    return [[{ status: "approved", variant_count: "3", total_stock: "12" }, { status: "pending", variant_count: 0, total_stock: null }]];
  } });
  await handler.products({ user: { vendor_id: 42 }, query: {} }, { json: (data) => {
    assert.deepEqual(JSON.parse(JSON.stringify(data.summary)), { totalProducts: 2, approved: 1, totalVariants: 3, totalStock: 12 });
  } });
});

test("stock report uses the same low-stock threshold as manager reports", async () => {
  const handler = controller({ execute: async (sql, params) => {
    assert.match(sql, /pv.stock BETWEEN 1 AND 9/);
    assert.equal(params[0], 42);
    return [[{ stock: "1" }, { stock: "9" }]];
  } });
  await handler.stock({ user: { vendor_id: 42 }, query: { status: "low_stock" } }, { json: (data) => {
    assert.deepEqual(JSON.parse(JSON.stringify(data.summary)), { totalVariants: 2, totalUnits: 10, lowStock: 2, outOfStock: 0 });
  } });
});
