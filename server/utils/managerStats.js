function numericStats(...groups) {
  return Object.fromEntries(
    Object.entries(Object.assign({}, ...groups)).map(([key, value]) => [key, Number(value) || 0]),
  );
}

function monthlyStats(rows, now = new Date()) {
  const byMonth = new Map(rows.map((row) => [row.month_key, row]));
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
    const key = date.toISOString().slice(0, 7);
    const row = byMonth.get(key) || {};
    return {
      month: date.toLocaleString("en", { month: "short", timeZone: "UTC" }),
      ...numericStats({ vendors: row.vendors, products: row.products, orders: row.orders, orderValue: row.orderValue }),
    };
  });
}

module.exports = { numericStats, monthlyStats };
