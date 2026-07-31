const db = require("../../config/database");
const { createError } = require("../utils/appError");

function toPositiveInt(value, fieldName, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) throw createError(400, `${fieldName} is required`);
    return null;
  }

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

function normalizeFilters(query) {
  const companyId = toPositiveInt(query.company_id, "company_id", true);
  const scheduleId = toPositiveInt(query.schedule_id, "schedule_id");
  const vendorId = toPositiveInt(query.vendor_id, "vendor_id");
  const productId = toPositiveInt(query.product_id, "product_id");
  const fromDate = normalizeDate(query.from_date, "from_date");
  const toDate = normalizeDate(query.to_date, "to_date");

  if (!scheduleId && fromDate && toDate && fromDate > toDate) {
    throw createError(400, "from_date cannot be after to_date");
  }

  return { companyId, scheduleId, vendorId, productId, fromDate, toDate };
}

function normalizePurchaseHistoryFilters(query) {
  const page = toPositiveInt(query.page, "page") ?? 1;
  const rawLimit = toPositiveInt(query.limit, "limit") ?? 25;
  const limit = Math.min(rawLimit, 100);
  const fromDate = normalizeDate(query.from_date, "from_date");
  const toDate = normalizeDate(query.to_date, "to_date");

  if (fromDate && toDate && fromDate > toDate) {
    throw createError(400, "from_date cannot be after to_date");
  }

  return {
    companyId: toPositiveInt(query.company_id, "company_id"),
    vendorId: toPositiveInt(query.vendor_id, "vendor_id"),
    productId: toPositiveInt(query.product_id, "product_id"),
    userId: toPositiveInt(query.user_id, "user_id"),
    scheduleId: toPositiveInt(query.schedule_id, "schedule_id"),
    fromDate,
    toDate,
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

function buildInvoiceWhere(filters) {
  const conditions = ["i.source = 'flea_market'", "fs.company_id = ?"];
  const params = [filters.companyId];

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

  if (filters.vendorId) {
    conditions.push("i.vendor_id = ?");
    params.push(filters.vendorId);
  }

  return { where: conditions.join(" AND "), params };
}

function buildPurchaseHistoryWhere(filters) {
  const conditions = ["i.source = 'flea_market'"];
  const params = [];

  if (filters.companyId) {
    conditions.push("c.company_id = ?");
    params.push(filters.companyId);
  }
  if (filters.vendorId) {
    conditions.push("v.vendor_id = ?");
    params.push(filters.vendorId);
  }
  if (filters.productId) {
    conditions.push("ii.product_id = ?");
    params.push(filters.productId);
  }
  if (filters.userId) {
    conditions.push("cust.user_id = ?");
    params.push(filters.userId);
  }
  if (filters.scheduleId) {
    conditions.push("fs.schedule_id = ?");
    params.push(filters.scheduleId);
  }
  if (filters.fromDate) {
    conditions.push("DATE(i.invoice_date) >= ?");
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    conditions.push("DATE(i.invoice_date) <= ?");
    params.push(filters.toDate);
  }

  return { where: conditions.join(" AND "), params };
}

function numberValue(value) {
  return Number(value || 0);
}

function mapSalesRow(row) {
  return {
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    productId: row.product_id,
    productName: row.product_name,
    brandName: row.brand_name,
    variantId: row.variant_id,
    sku: row.sku,
    scheduleId: row.schedule_id,
    scheduledDate: row.scheduled_date,
    clientCompanyName: row.client_company_name,
    allocatedQty: numberValue(row.allocated_qty),
    soldQty: numberValue(row.sold_qty),
    damagedQty: numberValue(row.damaged_qty),
    returnedQty: numberValue(row.returned_qty),
    allocationPrice: row.allocation_price === null ? null : numberValue(row.allocation_price),
    catalogSalePrice: numberValue(row.catalog_sale_price),
    effectivePrice: numberValue(row.effective_price),
    grossRevenue: numberValue(row.gross_revenue),
    sellThroughPct: numberValue(row.sell_through_pct),
    pointsRedeemed: 0,
  };
}

function mapPurchaseHistoryRow(row) {
  return {
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    userId: row.user_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    clientCompanyName: row.client_company_name,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    productId: row.product_id,
    productName: row.product_name,
    brandName: row.brand_name,
    sku: row.sku,
    quantity: numberValue(row.quantity),
    unitPrice: numberValue(row.unit_price),
    lineTotal: numberValue(row.line_total),
    pointsRedeemed: numberValue(row.reward_discount),
    amountPaid: numberValue(row.grand_total),
    scheduleId: row.schedule_id,
    scheduledDate: row.scheduled_date,
  };
}

class ReportService {
  async getFilterOptions(rawQuery) {
    const companyId = toPositiveInt(rawQuery.company_id, "company_id", true);
    const [schedules] = await db.execute(
      `SELECT
         fs.schedule_id,
         fs.company_id,
         c.company_name,
         fs.location_id,
         fl.name AS location_name,
         fs.scheduled_date,
         fs.start_time,
         fs.end_time,
         fs.status
       FROM flea_market_schedules fs
       JOIN companies c ON c.company_id = fs.company_id
       JOIN flea_market_locations fl ON fl.location_id = fs.location_id
       WHERE fs.company_id = ?
       ORDER BY fs.scheduled_date DESC, fs.start_time DESC`,
      [companyId],
    );

    return {
      schedules: schedules.map((row) => ({
        scheduleId: row.schedule_id,
        companyId: row.company_id,
        companyName: row.company_name,
        locationId: row.location_id,
        locationName: row.location_name,
        scheduledDate: row.scheduled_date,
        startTime: row.start_time,
        endTime: row.end_time,
        status: row.status,
      })),
    };
  }

  async getVendorSalesReport(rawQuery) {
    return this.getVendorSales(normalizeFilters(rawQuery));
  }

  async getVendorPointsRedeemedReport(rawQuery) {
    return this.getVendorPointsRedeemed(normalizeFilters(rawQuery));
  }

  // Pooled stock isn't per-event anymore, so "allocated/sold/damaged" per
  // event can no longer come from one allocation row — this reassembles the
  // same report shape from three sources instead: sold+revenue from
  // invoice_items/invoices (the actual sale record, already event-scoped via
  // invoices.schedule_id), damaged/topped-up from flea_market_stock_logs
  // (action-tagged, event-scoped via schedule_id when recorded live — see
  // poolStockService.resolveLogScheduleId). "Allocated" now means "topped up
  // during this event/range," the closest honest equivalent — the frontend
  // column is labelled "Topped Up" accordingly. returnedQty is always 0:
  // returns are a whole-program action, never tied to one event, so there's
  // nothing meaningful to attribute here.
  async getVendorSales(filters) {
    const scheduleConditions = ["fs.company_id = ?"];
    const scheduleParams = [filters.companyId];
    if (filters.scheduleId) {
      scheduleConditions.push("fs.schedule_id = ?");
      scheduleParams.push(filters.scheduleId);
    } else {
      if (filters.fromDate) {
        scheduleConditions.push("fs.scheduled_date >= ?");
        scheduleParams.push(filters.fromDate);
      }
      if (filters.toDate) {
        scheduleConditions.push("fs.scheduled_date <= ?");
        scheduleParams.push(filters.toDate);
      }
    }

    const soldConditions = ["i.source = 'flea_market'", ...scheduleConditions];
    const soldParams = [...scheduleParams];
    if (filters.vendorId) {
      soldConditions.push("i.vendor_id = ?");
      soldParams.push(filters.vendorId);
    }
    if (filters.productId) {
      soldConditions.push("ii.product_id = ?");
      soldParams.push(filters.productId);
    }

    const [soldRows] = await db.execute(
      `SELECT
         i.vendor_id, v.company_name AS vendor_name,
         ii.product_id, COALESCE(ep.product_name, ii.product_name) AS product_name, ep.brand_name,
         ii.variant_id, ii.sku,
         fs.schedule_id, fs.scheduled_date, c.company_name AS client_company_name,
         SUM(ii.quantity) AS sold_qty,
         SUM(ii.line_total) AS gross_revenue
       FROM invoice_items ii
       JOIN invoices i ON i.invoice_id = ii.invoice_id
       JOIN vendors v ON v.vendor_id = i.vendor_id
       LEFT JOIN eproducts ep ON ep.product_id = ii.product_id
       JOIN flea_market_schedules fs ON fs.schedule_id = i.schedule_id
       JOIN companies c ON c.company_id = fs.company_id
       WHERE ${soldConditions.join(" AND ")}
       GROUP BY i.vendor_id, ii.product_id, ii.variant_id, fs.schedule_id`,
      soldParams,
    );

    async function getLogQuantities(action) {
      const conditions = [`l.action = '${action}'`, ...scheduleConditions];
      const params = [...scheduleParams];
      if (filters.vendorId) {
        conditions.push("fvs.vendor_id = ?");
        params.push(filters.vendorId);
      }
      if (filters.productId) {
        conditions.push("fvs.product_id = ?");
        params.push(filters.productId);
      }

      const [rows] = await db.execute(
        `SELECT
           fvs.vendor_id, v.company_name AS vendor_name,
           fvs.product_id, ep.product_name, ep.brand_name,
           fvs.variant_id, pv.sku,
           fs.schedule_id, fs.scheduled_date, c.company_name AS client_company_name,
           SUM(l.quantity) AS quantity
         FROM flea_market_stock_logs l
         JOIN flea_market_vendor_stock fvs ON fvs.pool_id = l.pool_id
         JOIN vendors v ON v.vendor_id = fvs.vendor_id
         JOIN eproducts ep ON ep.product_id = fvs.product_id
         JOIN product_variants pv ON pv.variant_id = fvs.variant_id
         JOIN flea_market_schedules fs ON fs.schedule_id = l.schedule_id
         JOIN companies c ON c.company_id = fs.company_id
         WHERE ${conditions.join(" AND ")}
         GROUP BY fvs.vendor_id, fvs.product_id, fvs.variant_id, fs.schedule_id`,
        params,
      );
      return rows;
    }

    const [damagedRows, toppedUpRows] = await Promise.all([getLogQuantities("damage"), getLogQuantities("allocated")]);

    // Merge all three sources by (vendor, variant, schedule) — any one
    // source alone is enough to populate display metadata for a merged row.
    const merged = new Map();
    function keyFor(row) {
      return `${row.vendor_id}:${row.variant_id}:${row.schedule_id}`;
    }
    function ensureRow(row) {
      const key = keyFor(row);
      if (!merged.has(key)) {
        merged.set(key, {
          vendor_id: row.vendor_id,
          vendor_name: row.vendor_name,
          product_id: row.product_id,
          product_name: row.product_name,
          brand_name: row.brand_name,
          variant_id: row.variant_id,
          sku: row.sku,
          schedule_id: row.schedule_id,
          scheduled_date: row.scheduled_date,
          client_company_name: row.client_company_name,
          allocated_qty: 0,
          sold_qty: 0,
          damaged_qty: 0,
          returned_qty: 0,
          gross_revenue: 0,
        });
      }
      return merged.get(key);
    }

    for (const row of soldRows) {
      const entry = ensureRow(row);
      entry.sold_qty = numberValue(row.sold_qty);
      entry.gross_revenue = numberValue(row.gross_revenue);
    }
    for (const row of damagedRows) {
      ensureRow(row).damaged_qty = numberValue(row.quantity);
    }
    for (const row of toppedUpRows) {
      ensureRow(row).allocated_qty = numberValue(row.quantity);
    }

    const rows = Array.from(merged.values()).map((row) => ({
      ...row,
      allocation_price: null,
      catalog_sale_price: row.sold_qty > 0 ? row.gross_revenue / row.sold_qty : 0,
      effective_price: row.sold_qty > 0 ? row.gross_revenue / row.sold_qty : 0,
      sell_through_pct: row.allocated_qty > 0 ? Math.round((row.sold_qty / row.allocated_qty) * 1000) / 10 : 0,
    }));
    rows.sort((a, b) => b.gross_revenue - a.gross_revenue);

    const mappedRows = rows.map(mapSalesRow);
    const vendorIds = new Set(mappedRows.map((row) => row.vendorId));
    const eventIds = new Set(mappedRows.map((row) => row.scheduleId));

    return {
      rows: mappedRows,
      summary: {
        totalAllocated: mappedRows.reduce((sum, row) => sum + row.allocatedQty, 0),
        totalSold: mappedRows.reduce((sum, row) => sum + row.soldQty, 0),
        totalDamaged: mappedRows.reduce((sum, row) => sum + row.damagedQty, 0),
        totalReturned: mappedRows.reduce((sum, row) => sum + row.returnedQty, 0),
        totalGrossRevenue: mappedRows.reduce((sum, row) => sum + row.grossRevenue, 0),
        totalVendorsInvolved: vendorIds.size,
        totalEventsIncluded: eventIds.size,
      },
    };
  }

  async getVendorPointsRedeemed(filters) {
    const { where, params } = buildInvoiceWhere(filters);
    const [rows] = await db.execute(
      `SELECT
         i.vendor_id,
         v.company_name AS vendor_name,
         SUM(i.reward_discount) AS total_points_redeemed,
         SUM(i.grand_total) AS total_amount_collected,
         COUNT(DISTINCT i.invoice_id) AS invoice_count
       FROM invoices i
       JOIN vendors v ON v.vendor_id = i.vendor_id
       JOIN flea_market_schedules fs ON fs.schedule_id = i.schedule_id
       WHERE ${where}
       GROUP BY i.vendor_id, v.company_name`,
      params,
    );

    return rows.map((row) => ({
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      totalPointsRedeemed: numberValue(row.total_points_redeemed),
      totalAmountCollected: numberValue(row.total_amount_collected),
      invoiceCount: numberValue(row.invoice_count),
    }));
  }

  async getVendorSalesSummary(rawQuery) {
    const filters = normalizeFilters(rawQuery);
    const [salesData, pointsRows] = await Promise.all([
      this.getVendorSales(filters),
      this.getVendorPointsRedeemed(filters),
    ]);

    const pointsByVendor = new Map(pointsRows.map((row) => [row.vendorId, row]));
    const vendors = new Map();

    for (const row of salesData.rows) {
      if (!vendors.has(row.vendorId)) {
        vendors.set(row.vendorId, {
          vendorId: row.vendorId,
          vendorName: row.vendorName,
          productsSold: [],
          totalAllocated: 0,
          totalUnitsSold: 0,
          totalDamaged: 0,
          totalReturned: 0,
          totalRevenue: 0,
          totalPointsRedeemed: 0,
          sellThroughPct: 0,
        });
      }

      const vendor = vendors.get(row.vendorId);
      vendor.productsSold.push(row);
      vendor.totalAllocated += row.allocatedQty;
      vendor.totalUnitsSold += row.soldQty;
      vendor.totalDamaged += row.damagedQty;
      vendor.totalReturned += row.returnedQty;
      vendor.totalRevenue += row.grossRevenue;
    }

    for (const vendor of vendors.values()) {
      const points = pointsByVendor.get(vendor.vendorId);
      vendor.totalPointsRedeemed = points?.totalPointsRedeemed ?? 0;
      vendor.sellThroughPct = vendor.totalAllocated
        ? Number(((vendor.totalUnitsSold / vendor.totalAllocated) * 100).toFixed(1))
        : 0;

      vendor.productsSold = vendor.productsSold.map((product) => ({
        ...product,
        pointsRedeemed: 0,
      }));
    }

    const totalPointsRedeemed = pointsRows.reduce((sum, row) => sum + row.totalPointsRedeemed, 0);
    const summary = {
      ...salesData.summary,
      totalPointsRedeemed,
      sellThroughPct: salesData.summary.totalAllocated
        ? Number(((salesData.summary.totalSold / salesData.summary.totalAllocated) * 100).toFixed(1))
        : 0,
    };

    return {
      rows: salesData.rows,
      summary,
      vendors: Array.from(vendors.values()).sort((a, b) => b.totalRevenue - a.totalRevenue),
      pointsByVendor: pointsRows,
      scheduleJoinReliability:
        "Reports use invoices.schedule_id. Run migration 20260728_02_alter_invoices_add_flea_market_schedule_id.sql before using schedule-scoped invoice reports in production.",
    };
  }

  async getPurchaseHistoryFilterOptions() {
    const [companies, vendors, products, schedules] = await Promise.all([
      db.execute(
        `SELECT DISTINCT c.company_id, c.company_name
         FROM invoices i
         JOIN customer cust ON cust.user_id = i.user_id
         JOIN companies c ON c.company_id = cust.company_id
         WHERE i.source = 'flea_market'
         ORDER BY c.company_name ASC`,
      ),
      db.execute(
        `SELECT DISTINCT v.vendor_id, v.company_name
         FROM invoices i
         JOIN vendors v ON v.vendor_id = i.vendor_id
         WHERE i.source = 'flea_market'
         ORDER BY v.company_name ASC`,
      ),
      db.execute(
        `SELECT DISTINCT ep.product_id, ep.product_name, ep.brand_name
         FROM invoice_items ii
         JOIN invoices i ON i.invoice_id = ii.invoice_id
         JOIN eproducts ep ON ep.product_id = ii.product_id
         WHERE i.source = 'flea_market'
         ORDER BY ep.product_name ASC
         LIMIT 500`,
      ),
      db.execute(
        `SELECT DISTINCT fs.schedule_id, fs.company_id, c.company_name, fs.location_id,
                fl.name AS location_name, fs.scheduled_date, fs.start_time, fs.end_time, fs.status
         FROM flea_market_schedules fs
         JOIN companies c ON c.company_id = fs.company_id
         JOIN flea_market_locations fl ON fl.location_id = fs.location_id
         JOIN invoices i ON i.schedule_id = fs.schedule_id
         WHERE i.source = 'flea_market'
         ORDER BY fs.scheduled_date DESC, fs.start_time DESC`,
      ),
    ]);

    return {
      companies: companies[0].map((row) => ({ companyId: row.company_id, companyName: row.company_name })),
      vendors: vendors[0].map((row) => ({ vendorId: row.vendor_id, vendorName: row.company_name })),
      products: products[0].map((row) => ({
        productId: row.product_id,
        productName: row.product_name,
        brandName: row.brand_name,
      })),
      schedules: schedules[0].map((row) => ({
        scheduleId: row.schedule_id,
        companyId: row.company_id,
        companyName: row.company_name,
        locationId: row.location_id,
        locationName: row.location_name,
        scheduledDate: row.scheduled_date,
        startTime: row.start_time,
        endTime: row.end_time,
        status: row.status,
      })),
    };
  }

  async getPurchaseHistory(rawQuery) {
    const filters = normalizePurchaseHistoryFilters(rawQuery);
    const { where, params } = buildPurchaseHistoryWhere(filters);

    const baseQuery = `FROM invoice_items ii
       JOIN invoices i ON i.invoice_id = ii.invoice_id
       JOIN customer cust ON cust.user_id = i.user_id
       JOIN companies c ON c.company_id = cust.company_id
       JOIN vendors v ON v.vendor_id = i.vendor_id
       JOIN eproducts ep ON ep.product_id = ii.product_id
       LEFT JOIN flea_market_schedules fs ON fs.schedule_id = i.schedule_id
       WHERE ${where}`;

    const [rows] = await db.execute(
      `SELECT
         i.invoice_id,
         i.invoice_number,
         i.invoice_date,
         cust.user_id,
         cust.name AS customer_name,
         cust.phone AS customer_phone,
         cust.email AS customer_email,
         c.company_name AS client_company_name,
         v.vendor_id,
         v.company_name AS vendor_name,
         ii.product_id,
         ep.product_name,
         ep.brand_name,
         ii.sku,
         ii.quantity,
         ii.unit_price,
         ii.line_total,
         i.reward_discount,
         i.grand_total,
         fs.schedule_id,
         fs.scheduled_date
       ${baseQuery}
       ORDER BY i.invoice_date DESC
       LIMIT ? OFFSET ?`,
      [...params, filters.limit, filters.offset],
    );

    const [countRows] = await db.execute(`SELECT COUNT(*) AS total ${baseQuery}`, params);
    const total = numberValue(countRows[0]?.total);
    const totalPages = Math.max(1, Math.ceil(total / filters.limit));

    return {
      rows: rows.map(mapPurchaseHistoryRow),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages,
      },
    };
  }
}

module.exports = new ReportService();
