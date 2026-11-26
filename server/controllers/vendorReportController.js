const db = require("../config/database");
const { vendorOrderReport } = require("../utils/vendorReportData");
const { stockSummary } = require("../utils/managerReportStats");

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
      const stockClause = stockStatus === "out_of_stock" ? "pv.stock <= 0" : stockStatus === "low_stock" ? "pv.stock BETWEEN 1 AND 9" : stockStatus === "in_stock" ? "pv.stock >= 10" : "";
      if (stockClause) clauses.push(stockClause);
      const [rows] = await db.execute(
        `SELECT p.product_id, p.product_name, p.brand_name, pv.variant_id, pv.sku,
                pv.variant_attributes, pv.stock, pv.sale_price, pv.mrp, pv.is_visible, pv.created_at
         FROM eproducts p JOIN product_variants pv ON pv.product_id = p.product_id
         WHERE p.vendor_id = ? AND p.is_deleted = 0 AND COALESCE(p.created_via, '') <> 'flea_market_quick_create' ${clauses.length ? `AND ${clauses.join(" AND ")}` : ""}
         ORDER BY pv.stock ASC, p.product_name ASC`,
        [vendorId, ...params],
      );
      const stock = stockSummary(rows);
      const summary = { totalVariants: stock.variants, totalUnits: stock.units, lowStock: stock.lowStock, outOfStock: stock.outOfStock };
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
         WHERE p.vendor_id = ? AND p.is_deleted = 0 AND COALESCE(p.created_via, '') <> 'flea_market_quick_create' ${clauses.length ? `AND ${clauses.join(" AND ")}` : ""}
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
      const { clauses, params } = filters(req, "vo.created_at", ["o.order_ref", "s.awb_number", "s.courier_name"]);
      const report = await vendorOrderReport(db, vendorId, clauses, params, clean(req.query.status));
      return res.json({ success: true, ...report });
    } catch (error) { return sendError(res, error); }
  }
}

module.exports = new VendorReportController();
