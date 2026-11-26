function stockSummary(rows) {
  return rows.reduce((summary, row) => {
    const stock = Number(row.stock) || 0;
    summary.variants += 1;
    summary.units += stock;
    if (stock <= 0) summary.outOfStock += 1;
    else if (stock < 10) summary.lowStock += 1;
    return summary;
  }, { variants: 0, units: 0, lowStock: 0, outOfStock: 0 });
}

function orderReport(rows) {
  const normalized = rows.map((row) => {
    const cancelled = row.order_status === "cancelled" || row.shipping_status === "cancelled" ||
      (Number(row.item_count) > 0 && Number(row.active_items) === 0);
    const unpaid = ["pending_payment", "pending", "failed", "expired"].includes(row.order_status);
    return {
      ...row,
      shipping_status: cancelled ? "cancelled" : unpaid ? row.order_status : row.shipping_status,
      vendor_total: cancelled || unpaid ? 0 : Number(row.active_item_value) || 0,
      units: cancelled || unpaid ? 0 : Number(row.active_units) || 0,
    };
  });
  const summary = {
    orders: normalized.length,
    revenue: normalized.reduce((sum, row) => sum + Math.round(row.vendor_total * 100), 0) / 100,
    delivered: normalized.filter((row) => row.shipping_status === "delivered").length,
    cancelled: normalized.filter((row) => row.shipping_status === "cancelled").length,
  };
  return { rows: normalized, summary };
}

module.exports = { stockSummary, orderReport };
