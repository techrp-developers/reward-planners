const { test } = require("node:test");
const assert = require("node:assert/strict");
const { numericStats, monthlyStats } = require("../utils/managerStats");

test("SQL decimal strings and empty aggregates become numeric dashboard counts", () => {
  const stats = numericStats({ sentForApproval: "12", approved: null }, { productReviews: "3", orderValue: "145.50" });
  assert.equal(stats.sentForApproval + stats.productReviews, 15);
  assert.equal(stats.approved, 0);
  assert.equal(stats.orderValue, 145.5);
});

test("six calendar months include empty months and cross year boundaries", () => {
  const rows = [
    { month_key: "2025-12", vendors: "2", products: "3", orders: "4", orderValue: "500.25" },
    { month_key: "2026-03", vendors: 1, products: 0, orders: 1, orderValue: 100 },
    { month_key: "2025-01", vendors: 99 },
  ];
  const charts = monthlyStats(rows, new Date("2026-03-31T12:00:00Z"));
  assert.deepEqual(charts.map((row) => row.month), ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]);
  assert.deepEqual(charts[0], { month: "Oct", vendors: 0, products: 0, orders: 0, orderValue: 0 });
  assert.deepEqual(charts[2], { month: "Dec", vendors: 2, products: 3, orders: 4, orderValue: 500.25 });
  assert.equal(charts.reduce((sum, row) => sum + row.orderValue, 0), 600.25);
});

test("an empty database still returns six zero-valued months", () => {
  const charts = monthlyStats([], new Date("2026-11-16T00:00:00Z"));
  assert.deepEqual(charts.map((row) => row.month), ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"]);
  assert.ok(charts.every((row) => row.vendors === 0 && row.products === 0 && row.orders === 0 && row.orderValue === 0));
});
