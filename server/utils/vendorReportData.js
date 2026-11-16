const { orderReport } = require("./managerReportStats");

async function vendorOrderReport(db, vendorId, clauses = [], params = [], status = "") {
  const [data] = await db.execute(`
    SELECT vo.vendor_order_id, vo.order_id, o.order_ref, o.status AS order_status, o.cancellation_status,
      COALESCE(s.shipping_status, vo.shipping_status) AS shipping_status,
      COALESCE(items.item_count, 0) AS item_count,
      COALESCE(items.active_items, 0) AS active_items,
      COALESCE(items.active_units, 0) AS active_units,
      COALESCE(items.active_item_value, 0) AS active_item_value,
      s.awb_number, s.courier_name, vo.created_at
    FROM vendor_orders vo JOIN eorders o ON o.order_id = vo.order_id
    LEFT JOIN (
      SELECT vendor_order_id, COUNT(*) AS item_count,
        SUM(CASE WHEN COALESCE(fulfillment_status, '') <> 'cancelled' THEN 1 ELSE 0 END) AS active_items,
        SUM(CASE WHEN COALESCE(fulfillment_status, '') <> 'cancelled' THEN quantity ELSE 0 END) AS active_units,
        SUM(CASE WHEN COALESCE(fulfillment_status, '') <> 'cancelled' THEN final_price ELSE 0 END) AS active_item_value
      FROM eorder_items GROUP BY vendor_order_id
    ) items ON items.vendor_order_id = vo.vendor_order_id
    LEFT JOIN order_shipments s ON s.id = (
      SELECT MAX(latest.id) FROM order_shipments latest WHERE latest.vendor_order_id = vo.vendor_order_id
    )
    WHERE vo.vendor_id = ? ${clauses.length ? `AND ${clauses.join(" AND ")}` : ""}
    ORDER BY vo.created_at DESC, vo.vendor_order_id DESC`, [vendorId, ...params]);
  const normalized = orderReport(data).rows;
  const rows = status ? normalized.filter((row) => row.shipping_status === status) : normalized;
  return {
    rows,
    summary: {
      totalOrders: rows.length,
      revenue: rows.reduce((sum, row) => sum + Math.round(row.vendor_total * 100), 0) / 100,
      units: rows.reduce((sum, row) => sum + row.units, 0),
      delivered: rows.filter((row) => row.shipping_status === "delivered").length,
    },
  };
}

async function vendorOrderSummary(db, vendorId, limit, offset) {
  const { rows, summary } = await vendorOrderReport(db, vendorId);
  const activeStatuses = new Set(["pending", "confirmed", "processing", "booked", "ready_to_ship", "shipped", "picked_up", "in_transit", "out_for_delivery", "ndr"]);
  return {
    orders: rows.slice(offset, offset + limit),
    total: summary.totalOrders,
    summary: {
      revenue: summary.revenue,
      delivered: summary.delivered,
      active: rows.filter((row) =>
        !["pending_payment", "pending", "failed", "expired", "cancelled"].includes(row.order_status) &&
        activeStatuses.has(row.shipping_status),
      ).length,
    },
  };
}

module.exports = { vendorOrderReport, vendorOrderSummary };
