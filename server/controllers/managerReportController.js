const db = require("../config/database");
const { notifyUser } = require("../app/common/utils/notification");
const { stockSummary, orderReport } = require("../utils/managerReportStats");

const dateRange = (req, column, params) => {
  const from = String(req.query.fromDate || "").trim();
  const to = String(req.query.toDate || "").trim();
  if ((from && !to) || (!from && to) || (from && from > to)) throw Object.assign(new Error("Select a valid date range"), { status: 400 });
  if (!from) return "";
  params.push(from, to);
  return ` AND DATE(${column}) BETWEEN ? AND ?`;
};

const usageModules = [
  { key: "step_counter", module: "Step Counter", table: "fitness_steps", date: "step_date", activities: "COUNT(*)", condition: "steps > 0" },
  { key: "ecommerce", module: "Ecommerce", table: "eorders", date: "created_at", activities: "COUNT(*)", condition: "status NOT IN ('pending_payment','cancelled')" },
  { key: "service", module: "Service", table: "service_orders", date: "created_at", activities: "COUNT(DISTINCT parent_order_id)", condition: "payment_status = 'paid'" },
  { key: "bbps", module: "BBPS", table: "bbps_transactions", date: "created_at", activities: "COUNT(*)", condition: "LOWER(bbps_status) IN ('success','successful','completed')" },
];

class ManagerReportController {
  async inactiveUsers(req, res) {
    try {
      const [rows] = await db.execute(`
        SELECT cu.id, cu.company_id, cu.name, cu.email, cu.contact AS phone,
               cu.department, cu.role, co.company_name
        FROM company_users cu
        LEFT JOIN companies co ON co.company_id = cu.company_id
        WHERE COALESCE(cu.status, 0) <> 1
        ORDER BY co.company_name ASC, cu.name ASC, cu.id ASC
      `);
      return res.json({ success: true, rows });
    } catch (error) {
      console.error("Inactive users report error:", error);
      return res.status(500).json({ success: false, message: "Unable to load inactive users report" });
    }
  }

  async usage(req, res) {
    try {
      const rows = [];
      for (const item of usageModules) {
        const params = [];
        const range = dateRange(req, item.date, params);
        const [[row]] = await db.execute(`SELECT COUNT(DISTINCT user_id) AS active_users, ${item.activities} AS activities FROM ${item.table} WHERE ${item.condition}${range}`, params);
        rows.push({ key: item.key, module: item.module, active_users: Number(row.active_users) || 0, activities: Number(row.activities) || 0 });
      }
      const totalActivities = rows.reduce((sum, row) => sum + row.activities, 0);
      rows.forEach((row) => { row.usage_share = totalActivities ? Number(((row.activities / totalActivities) * 100).toFixed(1)) : 0; });
      return res.json({ success: true, rows, summary: { totalActivities, leadingModule: [...rows].sort((a, b) => b.active_users - a.active_users)[0]?.module || "—" } });
    } catch (error) { return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Unable to load usage report" }); }
  }

  async usageUsers(req, res) {
    try {
      const item = usageModules.find((m) => m.key === req.params.module);
      if (!item) return res.status(404).json({ success: false, message: "Unknown module" });
      const params = [];
      const range = dateRange(req, item.date, params);
      const [rows] = await db.execute(`
        SELECT u.user_id, c.name, c.email, c.phone, co.company_name, u.activities, u.last_activity
        FROM (
          SELECT user_id, ${item.activities} AS activities, MAX(${item.date}) AS last_activity
          FROM ${item.table}
          WHERE ${item.condition}${range}
          GROUP BY user_id
        ) u
        LEFT JOIN customer c ON c.user_id = u.user_id
        LEFT JOIN companies co ON co.company_id = c.company_id
        ORDER BY u.activities DESC, c.name ASC
      `, params);
      return res.json({ success: true, module: item.module, rows: rows.map((r) => ({ ...r, activities: Number(r.activities) || 0 })) });
    } catch (error) { return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Unable to load module users" }); }
  }

  async stock(req, res) {
    try {
      const search = String(req.query.search || "").trim(); const params = [];
      let filter = ""; if (search) { filter = " AND (p.product_name LIKE ? OR p.brand_name LIKE ? OR v.company_name LIKE ? OR pv.sku LIKE ?)"; params.push(...Array(4).fill(`%${search}%`)); }
      const range = dateRange(req, "pv.created_at", params);
      const [rows] = await db.execute(`SELECT pv.variant_id, p.product_id, p.product_name, p.brand_name, pv.sku, pv.stock, pv.variant_attributes, v.vendor_id, v.company_name, v.full_name AS vendor_name FROM product_variants pv JOIN eproducts p ON p.product_id=pv.product_id LEFT JOIN vendors v ON v.vendor_id=p.vendor_id WHERE p.is_deleted=0 AND COALESCE(p.created_via, '') <> 'flea_market_quick_create'${filter}${range} ORDER BY pv.stock ASC, p.product_name`, params);
      const summary = stockSummary(rows);
      return res.json({ success: true, rows, summary });
    } catch (error) { return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Unable to load stock report" }); }
  }

  async orders(req, res) {
    try {
      const params = []; const range = dateRange(req, "vo.created_at", params);
      const [rows] = await db.execute(`
        SELECT vo.vendor_order_id, o.order_ref, o.status AS order_status,
          v.company_name, v.full_name AS vendor_name, vo.shipping_status,
          COALESCE(items.item_count, 0) AS item_count,
          COALESCE(items.active_items, 0) AS active_items,
          COALESCE(items.active_item_value, 0) AS active_item_value, vo.created_at
        FROM vendor_orders vo JOIN eorders o ON o.order_id = vo.order_id
        LEFT JOIN vendors v ON v.vendor_id = vo.vendor_id
        LEFT JOIN (
          SELECT vendor_order_id, COUNT(*) AS item_count,
            SUM(CASE WHEN COALESCE(fulfillment_status, '') <> 'cancelled' THEN 1 ELSE 0 END) AS active_items,
            SUM(CASE WHEN COALESCE(fulfillment_status, '') <> 'cancelled' THEN final_price ELSE 0 END) AS active_item_value
          FROM eorder_items GROUP BY vendor_order_id
        ) items ON items.vendor_order_id = vo.vendor_order_id
        WHERE 1=1${range} ORDER BY vo.created_at DESC`, params);
      return res.json({ success: true, ...orderReport(rows) });
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
