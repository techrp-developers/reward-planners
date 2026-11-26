const { test } = require("node:test");
const assert = require("node:assert/strict");
const { stockSummary, orderReport } = require("../utils/managerReportStats");

const order = (overrides = {}) => ({ order_status: "paid", shipping_status: "processing", item_count: 2, active_items: 2, active_item_value: "300.50", vendor_total: "999.00", ...overrides });

test("unpaid and cancelled orders contribute no revenue, even with original vendor totals", () => {
  const report = orderReport([
    order(), order({ order_status: "pending_payment" }),
    order({ order_status: "cancelled" }), order({ shipping_status: "cancelled" }),
    order({ order_status: "failed" }), order({ order_status: "expired" }),
  ]);
  assert.equal(report.summary.revenue, 300.5);
  assert.equal(report.summary.orders, 6);
  assert.equal(report.summary.cancelled, 2);
  assert.ok(report.rows.slice(1).every((row) => row.vendor_total === 0));
});

test("partial cancellations use active line totals without multiplying by quantity", () => {
  const report = orderReport([order({ active_items: 1, active_item_value: "100.25" }), order({ active_items: 0, active_item_value: 0 })]);
  assert.equal(report.summary.revenue, 100.25);
  assert.equal(report.summary.cancelled, 1);
});

test("vendor portions remain separate and delivered count excludes cancelled parent orders", () => {
  const report = orderReport([
    order({ order_ref: "ONE", shipping_status: "delivered", active_item_value: "0.10" }),
    order({ order_ref: "ONE", shipping_status: "delivered", active_item_value: "0.20" }),
    order({ order_status: "cancelled", shipping_status: "delivered" }),
  ]);
  assert.equal(report.summary.orders, 3);
  assert.equal(report.summary.delivered, 2);
  assert.equal(report.summary.revenue, 0.3);
});

test("stock counts separate depleted, low and healthy variants", () => {
  assert.deepEqual(stockSummary([0, 1, "9", 10, "20"].map((stock) => ({ stock }))), {
    variants: 5, units: 40, lowStock: 2, outOfStock: 1,
  });
  assert.deepEqual(stockSummary([]), { variants: 0, units: 0, lowStock: 0, outOfStock: 0 });
  assert.equal(orderReport([]).summary.revenue, 0);
});
