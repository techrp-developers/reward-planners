const db = require("../config/database");

const clean = (value) => String(value || "").trim();

function filters(req, dateColumn, searchableColumns, statusColumn = null) {
  const clauses = [];
  const params = [];
  const search = clean(req.query.search);
  const status = clean(req.query.status);
  const fromDate = clean(req.query.fromDate);
  const toDate = clean(req.query.toDate);

  if ((fromDate && !toDate) || (!fromDate && toDate)) {
    const error = new Error("Select both From and To dates");
    error.status = 400;
    throw error;
  }
  if (fromDate && toDate && fromDate > toDate) {
    const error = new Error("From date cannot be after To date");
    error.status = 400;
    throw error;
  }
  if (search) {
    clauses.push(`(${searchableColumns.map((column) => `${column} LIKE ?`).join(" OR ")})`);
    searchableColumns.forEach(() => params.push(`%${search}%`));
  }
  if (status && statusColumn) {
    clauses.push(`${statusColumn} = ?`);
    params.push(status);
  }
  if (fromDate) {
    clauses.push(`DATE(${dateColumn}) BETWEEN ? AND ?`);
    params.push(fromDate, toDate);
  }
  return { clauses, params };
}

function sendError(res, error) {
  console.error("VENDOR REPORT ERROR:", error);
  return res.status(error.status || 500).json({
    success: false,
    message: error.status ? error.message : "Unable to generate report",
  });
}

class VendorReportController {
  async stock(req, res) {
    try {
      const vendorId = req.user?.vendor_id;
      if (!vendorId) return res.status(400).json({ success: false, message: "Vendor account is not linked" });
      const { clauses, params } = filters(req, "pv.created_at", ["p.product_name", "p.brand_name", "pv.sku"]);
      const stockStatus = clean(req.query.status);
      const stockClause = stockStatus === "out_of_stock" ? "pv.stock = 0" : stockStatus === "low_stock" ? "pv.stock BETWEEN 1 AND 10" : stockStatus === "in_stock" ? "pv.stock > 10" : "";
      if (stockClause) clauses.push(stockClause);
      const [rows] = await db.execute(
        `SELECT p.product_id, p.product_name, p.brand_name, pv.variant_id, pv.sku,
                pv.variant_attributes, pv.stock, pv.sale_price, pv.mrp, pv.is_visible, pv.created_at
         FROM eproducts p JOIN product_variants pv ON pv.product_id = p.product_id
         WHERE p.vendor_id = ? AND p.is_deleted = 0 ${clauses.length ? `AND ${clauses.join(" AND ")}` : ""}
         ORDER BY pv.stock ASC, p.product_name ASC`,
        [vendorId, ...params],
      );
      const summary = rows.reduce((result, row) => {
        result.totalVariants += 1;
        result.totalUnits += Number(row.stock) || 0;
        if (Number(row.stock) === 0) result.outOfStock += 1;
        else if (Number(row.stock) <= 10) result.lowStock += 1;
        return result;
      }, { totalVariants: 0, totalUnits: 0, lowStock: 0, outOfStock: 0 });
      return res.json({ success: true, rows, summary });
    } catch (error) { return sendError(res, error); }
  }

  async products(req, res) {
    try {
      const vendorId = req.user?.vendor_id;
      if (!vendorId) return res.status(400).json({ success: false, message: "Vendor account is not linked" });
      const { clauses, params } = filters(req, "p.created_at", ["p.product_name", "p.brand_name"], "p.status");
      const [rows] = await db.execute(
        `SELECT p.product_id, p.product_name, p.brand_name, c.category_name,
                sc.subcategory_name, p.status, p.is_visible, p.is_searchable, p.created_at,
                COUNT(pv.variant_id) AS variant_count, COALESCE(SUM(pv.stock), 0) AS total_stock
         FROM eproducts p
         LEFT JOIN categories c ON c.category_id = p.category_id
         LEFT JOIN sub_categories sc ON sc.subcategory_id = p.subcategory_id
         LEFT JOIN product_variants pv ON pv.product_id = p.product_id
         WHERE p.vendor_id = ? AND p.is_deleted = 0 ${clauses.length ? `AND ${clauses.join(" AND ")}` : ""}
         GROUP BY p.product_id ORDER BY p.created_at DESC`,
        [vendorId, ...params],
      );
      const summary = rows.reduce((result, row) => {
        result.totalProducts += 1;
        result.totalVariants += Number(row.variant_count) || 0;
        result.totalStock += Number(row.total_stock) || 0;
        if (row.status === "approved") result.approved += 1;
        return result;
      }, { totalProducts: 0, approved: 0, totalVariants: 0, totalStock: 0 });
      return res.json({ success: true, rows, summary });
    } catch (error) { return sendError(res, error); }
  }

  async orders(req, res) {
    try {
      const vendorId = req.user?.vendor_id;
      if (!vendorId) return res.status(400).json({ success: false, message: "Vendor account is not linked" });
      const { clauses, params } = filters(req, "vo.created_at", ["o.order_ref", "s.awb_number", "s.courier_name"], "vo.shipping_status");
      const [rows] = await db.execute(
        `SELECT vo.vendor_order_id, o.order_ref, vo.vendor_total, vo.shipping_status,
                COUNT(oi.order_item_id) AS item_count, COALESCE(SUM(oi.quantity), 0) AS units,
                s.awb_number, s.courier_name, vo.created_at
         FROM vendor_orders vo JOIN eorders o ON o.order_id = vo.order_id
         LEFT JOIN eorder_items oi ON oi.vendor_order_id = vo.vendor_order_id
         LEFT JOIN order_shipments s ON s.vendor_order_id = vo.vendor_order_id
         WHERE vo.vendor_id = ? ${clauses.length ? `AND ${clauses.join(" AND ")}` : ""}
         GROUP BY vo.vendor_order_id ORDER BY vo.created_at DESC`,
        [vendorId, ...params],
      );
      const summary = rows.reduce((result, row) => {
        result.totalOrders += 1;
        result.revenue += Number(row.vendor_total) || 0;
        result.units += Number(row.units) || 0;
        if (row.shipping_status === "delivered") result.delivered += 1;
        return result;
      }, { totalOrders: 0, revenue: 0, units: 0, delivered: 0 });
      return res.json({ success: true, rows, summary });
    } catch (error) { return sendError(res, error); }
  }
}

module.exports = new VendorReportController();
