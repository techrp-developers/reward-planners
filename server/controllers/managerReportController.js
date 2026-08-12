const db = require("../config/database");
const { notifyUser } = require("../app/common/utils/notification");

const dateRange = (req, column, params) => {
  const from = String(req.query.fromDate || "").trim();
  const to = String(req.query.toDate || "").trim();
  if ((from && !to) || (!from && to) || (from && from > to)) throw Object.assign(new Error("Select a valid date range"), { status: 400 });
  if (!from) return "";
  params.push(from, to);
  return ` AND DATE(${column}) BETWEEN ? AND ?`;
};

class ManagerReportController {
  async usage(req, res) {
    try {
      const modules = [
        { module: "Step Counter", table: "fitness_steps", date: "step_date", users: "COUNT(DISTINCT user_id)", activities: "COUNT(*)", condition: "steps > 0" },
        { module: "Ecommerce", table: "eorders", date: "created_at", users: "COUNT(DISTINCT user_id)", activities: "COUNT(*)", condition: "status NOT IN ('pending_payment','cancelled')" },
        { module: "Service", table: "service_orders", date: "created_at", users: "COUNT(DISTINCT user_id)", activities: "COUNT(DISTINCT parent_order_id)", condition: "payment_status = 'paid'" },
        { module: "BBPS", table: "bbps_transactions", date: "created_at", users: "COUNT(DISTINCT user_id)", activities: "COUNT(*)", condition: "LOWER(bbps_status) IN ('success','successful','completed')" },
      ];
      const rows = [];
      for (const item of modules) {
        const params = [];
        const range = dateRange(req, item.date, params);
        const [[row]] = await db.execute(`SELECT ${item.users} AS active_users, ${item.activities} AS activities FROM ${item.table} WHERE ${item.condition}${range}`, params);
        rows.push({ module: item.module, active_users: Number(row.active_users) || 0, activities: Number(row.activities) || 0 });
      }
      const totalActivities = rows.reduce((sum, row) => sum + row.activities, 0);
      rows.forEach((row) => { row.usage_share = totalActivities ? Number(((row.activities / totalActivities) * 100).toFixed(1)) : 0; });
      return res.json({ success: true, rows, summary: { totalActivities, leadingModule: [...rows].sort((a, b) => b.active_users - a.active_users)[0]?.module || "—" } });
    } catch (error) { return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Unable to load usage report" }); }
  }

  async stock(req, res) {
    try {
      const search = String(req.query.search || "").trim(); const params = [];
      let filter = ""; if (search) { filter = " AND (p.product_name LIKE ? OR p.brand_name LIKE ? OR v.company_name LIKE ? OR pv.sku LIKE ?)"; params.push(...Array(4).fill(`%${search}%`)); }
      const range = dateRange(req, "p.created_at", params);
      const [rows] = await db.execute(`SELECT pv.variant_id, p.product_id, p.product_name, p.brand_name, pv.sku, pv.stock, pv.variant_attributes, v.vendor_id, v.company_name, v.full_name AS vendor_name FROM product_variants pv JOIN eproducts p ON p.product_id=pv.product_id JOIN vendors v ON v.vendor_id=p.vendor_id WHERE p.is_deleted=0${filter}${range} ORDER BY pv.stock ASC, p.product_name`, params);
      const summary = { variants: rows.length, units: rows.reduce((s, r) => s + Number(r.stock || 0), 0), lowStock: rows.filter((r) => Number(r.stock) < 10).length, outOfStock: rows.filter((r) => Number(r.stock) === 0).length };
      return res.json({ success: true, rows, summary });
    } catch (error) { return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Unable to load stock report" }); }
  }

  async orders(req, res) {
    try {
      const params = []; const range = dateRange(req, "vo.created_at", params);
      const [rows] = await db.execute(`SELECT vo.vendor_order_id, o.order_ref, v.company_name, v.full_name AS vendor_name, vo.vendor_total, vo.shipping_status, COUNT(oi.order_item_id) AS item_count, vo.created_at FROM vendor_orders vo JOIN eorders o ON o.order_id=vo.order_id JOIN vendors v ON v.vendor_id=vo.vendor_id LEFT JOIN eorder_items oi ON oi.vendor_order_id=vo.vendor_order_id WHERE 1=1${range} GROUP BY vo.vendor_order_id ORDER BY vo.created_at DESC`, params);
      const summary = { orders: rows.length, revenue: rows.reduce((s, r) => s + Number(r.vendor_total || 0), 0), delivered: rows.filter((r) => r.shipping_status === "delivered").length, cancelled: rows.filter((r) => r.shipping_status === "cancelled").length };
      return res.json({ success: true, rows, summary });
    } catch (error) { return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Unable to load order report" }); }
  }

  async sendStockAlert(req, res) {
    try {
      const variantId = Number(req.params.variantId);
      const [[row]] = await db.execute(`SELECT pv.variant_id, pv.sku, pv.stock, p.product_id, p.product_name, v.user_id FROM product_variants pv JOIN eproducts p ON p.product_id=pv.product_id JOIN vendors v ON v.vendor_id=p.vendor_id WHERE pv.variant_id=? AND p.is_deleted=0`, [variantId]);
      if (!row) return res.status(404).json({ success: false, message: "Variant not found" });
      if (Number(row.stock) >= 10) return res.status(409).json({ success: false, message: "Stock is no longer below 10" });
      notifyUser({ userId: row.user_id, module: "ecommerce", type: "vendor_low_stock", title: "Low stock alert", message: `${row.product_name} (${row.sku}) has only ${row.stock} unit${Number(row.stock) === 1 ? "" : "s"} remaining.`, icon: "alert-triangle", reference_type: "product", reference_id: row.product_id, action_url: `/vendor/products/manage-product/${row.product_id}`, priority: "high" }, "vendor low-stock alert");
      return res.json({ success: true, message: "Low-stock alert sent" });
    } catch (error) { return res.status(500).json({ success: false, message: "Unable to send stock alert" }); }
  }
}
module.exports = new ManagerReportController();
