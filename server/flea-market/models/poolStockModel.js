const db = require("../../config/database");
const { getPublicUrl } = require("../utils/publicUrl");

// Primary/hero image only — same "lowest sort_order row in product_images"
// convention server/app/ecommerce/v1/models/productModel.js already uses for
// its own listing thumbnails. Product-level only (not variant-level): a
// flea market listing shows one row per product, so a single representative
// image is enough — never required at product creation, purely display.
const HERO_IMAGE_JOIN = `
  LEFT JOIN product_images pimg ON pimg.image_id = (
    SELECT pi2.image_id FROM product_images pi2
    WHERE pi2.product_id = p.product_id
    ORDER BY pi2.sort_order ASC
    LIMIT 1
  )`;

// Persistent per-(vendor,variant) stock pool — replaces the old per-event
// flea_market_stock_allocations model. Only one flea market event ever runs
// at a time (confirmed business rule), so stock lives in ONE pool per
// vendor+variant until explicitly returned to the vendor's warehouse, not
// re-allocated from scratch for every event. See
// server/scripts/migrate-allocations-to-vendor-stock.js for the migration
// that consolidated the old per-event rows into this table.
class PoolStockModel {
  async findByVendorAndVariant(vendorId, variantId, conn = db) {
    const [rows] = await conn.execute(
      `SELECT * FROM flea_market_vendor_stock WHERE vendor_id = ? AND variant_id = ?`,
      [vendorId, variantId],
    );
    return rows[0];
  }

  // Creates the pool if this is the first time this vendor+variant has ever
  // been topped up, or adds to the existing pool's allocated_qty otherwise —
  // relies on uniq_vendor_variant_pool to make this a true upsert, never a
  // duplicate row per event the way the old table worked.
  async upsertTopUp({ vendorId, productId, variantId, qty, allocationPrice, allocatedBy }, conn) {
    await conn.execute(
      `INSERT INTO flea_market_vendor_stock
        (vendor_id, product_id, variant_id, allocated_qty, allocation_price, allocated_by, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE
         allocated_qty = allocated_qty + VALUES(allocated_qty),
         allocation_price = COALESCE(VALUES(allocation_price), allocation_price),
         status = 'active'`,
      [vendorId, productId, variantId, qty, allocationPrice ?? null, allocatedBy ?? null],
    );
    return this.findByVendorAndVariant(vendorId, variantId, conn);
  }

  async findById(poolId, conn = db) {
    const [rows] = await conn.execute(`SELECT * FROM flea_market_vendor_stock WHERE pool_id = ?`, [poolId]);
    return rows[0];
  }

  async findByIdForUpdate(poolId, conn) {
    const [rows] = await conn.execute(`SELECT * FROM flea_market_vendor_stock WHERE pool_id = ? FOR UPDATE`, [poolId]);
    return rows[0];
  }

  async findByIdJoined(poolId) {
    const [rows] = await db.execute(
      `SELECT
         fvs.*,
         v.company_name AS vendor_name,
         p.product_name,
         pv.sku
       FROM flea_market_vendor_stock fvs
       JOIN vendors v ON v.vendor_id = fvs.vendor_id
       JOIN eproducts p ON p.product_id = fvs.product_id
       JOIN product_variants pv ON pv.variant_id = fvs.variant_id
       WHERE fvs.pool_id = ?`,
      [poolId],
    );
    return rows[0];
  }

  // Unscoped — every active pool, regardless of which event it was topped up
  // during. Replaces findByScheduleId, since pools no longer belong to one event.
  async findAll() {
    const [rows] = await db.execute(
      `SELECT
         fvs.*,
         v.company_name AS vendor_name,
         p.product_name,
         pv.sku
       FROM flea_market_vendor_stock fvs
       JOIN vendors v ON v.vendor_id = fvs.vendor_id
       JOIN eproducts p ON p.product_id = fvs.product_id
       JOIN product_variants pv ON pv.variant_id = fvs.variant_id
       ORDER BY fvs.updated_at DESC`,
    );
    return rows;
  }

  // Bulk label-print target — every currently-active pool, joined with
  // vendor/product/sku for the label. Unlike findAll(), excludes closed pools.
  async findAllActive() {
    const [rows] = await db.execute(
      `SELECT
         fvs.*,
         v.company_name AS vendor_name,
         p.product_name,
         pv.sku
       FROM flea_market_vendor_stock fvs
       JOIN vendors v ON v.vendor_id = fvs.vendor_id
       JOIN eproducts p ON p.product_id = fvs.product_id
       JOIN product_variants pv ON pv.variant_id = fvs.variant_id
       WHERE fvs.status = 'active'
       ORDER BY fvs.updated_at DESC`,
    );
    return rows;
  }

  // The billing-time source of truth — no schedule scoping anymore, since
  // only one event ever runs at a time and pooled stock isn't tied to it.
  async findActivePools(query, limit) {
    const like = `%${query}%`;
    const [rows] = await db.execute(
      `SELECT
         fvs.pool_id, fvs.variant_id, fvs.product_id, fvs.vendor_id,
         fvs.allocation_price, fvs.available_qty,
         p.product_name, p.brand_name,
         pv.sku, pv.mrp, pv.sale_price,
         pimg.image_url
       FROM flea_market_vendor_stock fvs
       JOIN eproducts p ON p.product_id = fvs.product_id
       JOIN product_variants pv ON pv.variant_id = fvs.variant_id
       ${HERO_IMAGE_JOIN}
       WHERE fvs.status = 'active' AND fvs.available_qty > 0
         AND (p.product_name LIKE ? OR pv.sku LIKE ? OR p.brand_name LIKE ?)
       LIMIT ?`,
      [like, like, like, limit],
    );
    return rows.map((row) => ({ ...row, hero_image: getPublicUrl(row.image_url) }));
  }

  // For the barcode scan endpoint — unlike findActivePools, this doesn't
  // pre-filter by status/available_qty, so the caller can distinguish
  // "not active" from "out of stock" from "found and sellable" itself.
  async findByIdForScan(poolId) {
    const [rows] = await db.execute(
      `SELECT
         fvs.pool_id, fvs.variant_id, fvs.product_id, fvs.vendor_id, fvs.status, fvs.available_qty, fvs.allocation_price,
         p.product_name, p.brand_name,
         pv.sku, pv.mrp, pv.sale_price,
         pimg.image_url
       FROM flea_market_vendor_stock fvs
       JOIN eproducts p ON p.product_id = fvs.product_id
       JOIN product_variants pv ON pv.variant_id = fvs.variant_id
       ${HERO_IMAGE_JOIN}
       WHERE fvs.pool_id = ?`,
      [poolId],
    );
    const row = rows[0];
    return row ? { ...row, hero_image: getPublicUrl(row.image_url) } : row;
  }

  async findActiveByVariant(variantId, conn = db) {
    const [rows] = await conn.execute(
      `SELECT * FROM flea_market_vendor_stock WHERE variant_id = ? AND status = 'active'`,
      [variantId],
    );
    return rows[0];
  }

  // Conditional on the row lock's own read of available_qty (checked by the
  // caller before this runs) — the WHERE clause is a second guard against a
  // concurrent sale slipping in between the lock and this write.
  async recordSale(poolId, qty, conn) {
    const [result] = await conn.execute(
      `UPDATE flea_market_vendor_stock SET sold_qty = sold_qty + ? WHERE pool_id = ? AND available_qty >= ?`,
      [qty, poolId, qty],
    );
    return result.affectedRows > 0;
  }

  async recordDamage(poolId, qty, conn) {
    await conn.execute(`UPDATE flea_market_vendor_stock SET damaged_qty = damaged_qty + ? WHERE pool_id = ?`, [
      qty,
      poolId,
    ]);
  }

  // Manual correction to the pool's allocated total (physical recount) — the
  // free variable available_qty is derived from. Positive delta = found more
  // than the ledger shows, negative = found less. Never touches sold/damaged.
  async adjustAllocatedQty(poolId, delta, conn) {
    await conn.execute(`UPDATE flea_market_vendor_stock SET allocated_qty = allocated_qty + ? WHERE pool_id = ?`, [
      delta,
      poolId,
    ]);
  }

  // Explicit end-of-program return to the vendor's real warehouse — NOT
  // triggered by any event closing anymore, since the pool persists across
  // events. Conditional on available_qty the same way recordSale is.
  async recordReturn(poolId, returnQty, conn) {
    const [result] = await conn.execute(
      `UPDATE flea_market_vendor_stock SET returned_qty = returned_qty + ? WHERE pool_id = ? AND available_qty >= ?`,
      [returnQty, poolId, returnQty],
    );
    return result.affectedRows > 0;
  }

  async closePool(poolId, conn) {
    await conn.execute(`UPDATE flea_market_vendor_stock SET status = 'closed' WHERE pool_id = ?`, [poolId]);
  }

  // Price-only edit — never touches quantities, so it doesn't need a row lock.
  async updateAllocationPrice(poolId, allocationPrice, conn = db) {
    await conn.execute(`UPDATE flea_market_vendor_stock SET allocation_price = ? WHERE pool_id = ?`, [
      allocationPrice,
      poolId,
    ]);
  }

  // Hard delete — only ever called after the service confirms the pool has
  // zero sold/damaged/returned activity, so there's no history being erased.
  // flea_market_stock_logs.pool_id is ON DELETE CASCADE, so any 'allocated'
  // logs for this pool go with it.
  async deletePool(poolId, conn) {
    await conn.execute(`DELETE FROM flea_market_vendor_stock WHERE pool_id = ?`, [poolId]);
  }

  async insertLog({ poolId, action, quantity, remarks, createdBy, scheduleId }, conn) {
    await conn.execute(
      `INSERT INTO flea_market_stock_logs (pool_id, action, quantity, remarks, created_by, schedule_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [poolId, action, quantity, remarks ?? null, createdBy ?? null, scheduleId ?? null],
    );
  }

  async findLogsForPool(poolId) {
    const [rows] = await db.execute(`SELECT * FROM flea_market_stock_logs WHERE pool_id = ? ORDER BY created_at DESC`, [
      poolId,
    ]);
    return rows;
  }

  // Sourced from the log table, not the pool table — this is what "how did
  // THIS specific event perform" means now that pools aren't per-event.
  async getEventSummary(scheduleId) {
    const [rows] = await db.execute(
      `SELECT
         fvs.vendor_id, v.company_name AS vendor_name,
         fvs.product_id, p.product_name,
         fvs.variant_id, pv.sku,
         l.action,
         SUM(l.quantity) AS total_quantity
       FROM flea_market_stock_logs l
       JOIN flea_market_vendor_stock fvs ON fvs.pool_id = l.pool_id
       JOIN vendors v ON v.vendor_id = fvs.vendor_id
       JOIN eproducts p ON p.product_id = fvs.product_id
       JOIN product_variants pv ON pv.variant_id = fvs.variant_id
       WHERE l.schedule_id = ? AND l.action IN ('sale', 'damage')
       GROUP BY fvs.vendor_id, fvs.product_id, fvs.variant_id, l.action
       ORDER BY v.company_name, p.product_name`,
      [scheduleId],
    );
    return rows;
  }
}

module.exports = new PoolStockModel();
