const db = require("../config/database");

// Vendor-facing view of the same data the admin-side Purchase History report
// (server/flea-market/services/reportService.js: getPurchaseHistory) already
// exposes — same tables, same 'flea_market' invoice source discriminator,
// same client_company_name resolution (via the customer's own company, not
// the event host) — but scoped to exactly one vendor and with customer PII
// masked before it ever leaves the server.

function createError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function toPositiveInt(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function normalizeDate(value, fieldName) {
  if (!value) return null;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw createError(400, `${fieldName} must be in YYYY-MM-DD format`);
  }
  return text;
}

function normalizeFilters(rawQuery) {
  const page = toPositiveInt(rawQuery.page, "page") ?? 1;
  const rawLimit = toPositiveInt(rawQuery.limit, "limit") ?? 25;
  const limit = Math.min(rawLimit, 100);
  const scheduleId = toPositiveInt(rawQuery.schedule_id, "schedule_id");
  const fromDate = normalizeDate(rawQuery.from_date, "from_date");
  const toDate = normalizeDate(rawQuery.to_date, "to_date");

  if (fromDate && toDate && fromDate > toDate) {
    throw createError(400, "from_date cannot be after to_date");
  }

  return { scheduleId, fromDate, toDate, page, limit, offset: (page - 1) * limit };
}

// vendorId is the ONLY caller of this — it always comes from
// req.user.vendor_id (resolved server-side from the authenticated session in
// middleware/auth.js), never from rawQuery. Every query built from this
// WHERE is therefore structurally incapable of touching another vendor's rows.
function buildWhere(vendorId, filters) {
  const conditions = ["i.source = 'flea_market'", "i.vendor_id = ?"];
  const params = [vendorId];

  if (filters.scheduleId) {
    conditions.push("fs.schedule_id = ?");
    params.push(filters.scheduleId);
  } else {
    if (filters.fromDate) {
      conditions.push("DATE(i.invoice_date) >= ?");
      params.push(filters.fromDate);
    }
    if (filters.toDate) {
      conditions.push("DATE(i.invoice_date) <= ?");
      params.push(filters.toDate);
    }
  }

  return { where: conditions.join(" AND "), params };
}

function numberValue(value) {
  return Number(value || 0);
}

// Enough for a vendor to recognize a repeat customer/pattern without full
// contact info — matches the masking already used for customer info shown
// outside a verified customer session (see client/.../flea_market/utils/mask.ts,
// used in InvoiceView.tsx). Masking happens here, server-side, so unmasked
// PII never leaves the server for this endpoint at all.
function maskName(name) {
  if (!name) return null;
  const trimmed = String(name).trim();
  if (!trimmed) return null;
  return trimmed.charAt(0) + "*".repeat(Math.max(trimmed.length - 1, 0));
}

function maskPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).trim();
  if (!digits) return null;
  if (digits.length <= 4) return "*".repeat(digits.length);
  return digits.slice(0, 2) + "*".repeat(digits.length - 4) + digits.slice(-2);
}

function mapRow(row) {
  return {
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    scheduleId: row.schedule_id,
    scheduledDate: row.scheduled_date,
    clientCompanyName: row.client_company_name,
    productId: row.product_id,
    productName: row.product_name,
    brandName: row.brand_name,
    sku: row.sku,
    quantity: numberValue(row.quantity),
    unitPrice: numberValue(row.unit_price),
    lineTotal: numberValue(row.line_total),
    customerNameMasked: maskName(row.customer_name),
    customerPhoneMasked: maskPhone(row.customer_phone),
  };
}

class VendorFleaMarketPurchasesService {
  async getFilterOptions(vendorId) {
    const [schedules] = await db.execute(
      `SELECT DISTINCT fs.schedule_id, fs.scheduled_date, fs.start_time, fs.end_time, fs.status,
              c.company_name AS host_company_name
       FROM flea_market_schedules fs
       JOIN companies c ON c.company_id = fs.company_id
       JOIN invoices i ON i.schedule_id = fs.schedule_id
       WHERE i.source = 'flea_market' AND i.vendor_id = ?
       ORDER BY fs.scheduled_date DESC, fs.start_time DESC`,
      [vendorId],
    );

    return {
      schedules: schedules.map((row) => ({
        scheduleId: row.schedule_id,
        scheduledDate: row.scheduled_date,
        startTime: row.start_time,
        endTime: row.end_time,
        status: row.status,
        hostCompanyName: row.host_company_name,
      })),
    };
  }

  async getPurchases(vendorId, rawQuery) {
    const filters = normalizeFilters(rawQuery);
    const { where, params } = buildWhere(vendorId, filters);

    const baseQuery = `FROM invoice_items ii
       JOIN invoices i ON i.invoice_id = ii.invoice_id
       JOIN customer cust ON cust.user_id = i.user_id
       JOIN companies c ON c.company_id = cust.company_id
       LEFT JOIN eproducts ep ON ep.product_id = ii.product_id
       LEFT JOIN flea_market_schedules fs ON fs.schedule_id = i.schedule_id
       WHERE ${where}`;

    const [rows] = await db.execute(
      `SELECT
         i.invoice_id, i.invoice_number, i.invoice_date,
         fs.schedule_id, fs.scheduled_date,
         c.company_name AS client_company_name,
         ii.product_id, ii.sku,
         COALESCE(ep.product_name, ii.product_name) AS product_name,
         ep.brand_name,
         ii.quantity, ii.unit_price, ii.line_total,
         cust.name AS customer_name,
         cust.phone AS customer_phone
       ${baseQuery}
       ORDER BY i.invoice_date DESC
       LIMIT ? OFFSET ?`,
      [...params, filters.limit, filters.offset],
    );

    const [countRows] = await db.execute(`SELECT COUNT(*) AS total ${baseQuery}`, params);
    const total = numberValue(countRows[0]?.total);
    const totalPages = Math.max(1, Math.ceil(total / filters.limit));

    // Summary aggregates the FULL filtered set, not just the current page —
    // a lean query with none of the display-only joins above.
    const [[summaryRow]] = await db.execute(
      `SELECT
         COALESCE(SUM(ii.quantity), 0) AS total_units_sold,
         COALESCE(SUM(ii.line_total), 0) AS total_revenue,
         COUNT(DISTINCT i.invoice_id) AS total_orders
       FROM invoice_items ii
       JOIN invoices i ON i.invoice_id = ii.invoice_id
       LEFT JOIN flea_market_schedules fs ON fs.schedule_id = i.schedule_id
       WHERE ${where}`,
      params,
    );

    return {
      rows: rows.map(mapRow),
      pagination: { page: filters.page, limit: filters.limit, total, totalPages },
      summary: {
        totalUnitsSold: numberValue(summaryRow?.total_units_sold),
        totalRevenue: numberValue(summaryRow?.total_revenue),
        totalOrders: numberValue(summaryRow?.total_orders),
      },
    };
  }
}

module.exports = new VendorFleaMarketPurchasesService();
