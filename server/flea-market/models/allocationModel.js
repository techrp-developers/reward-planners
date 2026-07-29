const db = require("../../config/database");

class AllocationModel {
  async findExisting(scheduleId, vendorId, variantId, conn = db) {
    const [rows] = await conn.execute(
      `SELECT * FROM flea_market_stock_allocations WHERE schedule_id = ? AND vendor_id = ? AND variant_id = ?`,
      [scheduleId, vendorId, variantId],
    );
    return rows[0];
  }

  // initialStatus is 'active' when the event is already under way (so stock
  // allocated mid-event is immediately sellable) or 'allocated' when it's
  // still pending — see allocationService.allocate, which decides this from
  // the schedule's current status. Without this, an allocation added after
  // the one-time "mark in_progress" activation hook already fired would be
  // stuck un-sellable forever.
  async create({ scheduleId, vendorId, productId, variantId, allocatedQty, allocationPrice, allocatedBy, initialStatus }, conn) {
    const [result] = await conn.execute(
      `INSERT INTO flea_market_stock_allocations
        (schedule_id, vendor_id, product_id, variant_id, allocated_qty, allocation_price, allocated_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [scheduleId, vendorId, productId, variantId, allocatedQty, allocationPrice ?? null, allocatedBy ?? null, initialStatus],
    );
    return result.insertId;
  }

  async findById(allocationId, conn = db) {
    const [rows] = await conn.execute(`SELECT * FROM flea_market_stock_allocations WHERE allocation_id = ?`, [
      allocationId,
    ]);
    return rows[0];
  }

  async findByIdForUpdate(allocationId, conn) {
    const [rows] = await conn.execute(
      `SELECT * FROM flea_market_stock_allocations WHERE allocation_id = ? FOR UPDATE`,
      [allocationId],
    );
    return rows[0];
  }

  async findByIdJoined(allocationId) {
    const [rows] = await db.execute(
      `SELECT
         a.*,
         v.company_name AS vendor_name,
         p.product_name,
         pv.sku
       FROM flea_market_stock_allocations a
       JOIN vendors v ON v.vendor_id = a.vendor_id
       JOIN eproducts p ON p.product_id = a.product_id
       JOIN product_variants pv ON pv.variant_id = a.variant_id
       WHERE a.allocation_id = ?`,
      [allocationId],
    );
    return rows[0];
  }

  async findByScheduleId(scheduleId) {
    const [rows] = await db.execute(
      `SELECT
         a.*,
         v.company_name AS vendor_name,
         p.product_name,
         pv.sku
       FROM flea_market_stock_allocations a
       JOIN vendors v ON v.vendor_id = a.vendor_id
       JOIN eproducts p ON p.product_id = a.product_id
       JOIN product_variants pv ON pv.variant_id = a.variant_id
       WHERE a.schedule_id = ?
       ORDER BY a.created_at DESC`,
      [scheduleId],
    );
    return rows;
  }

  // The billing-time source of truth: which allocations for this schedule can
  // currently be sold against — used by the repointed /products/search.
  async findActiveByScheduleId(scheduleId, query, limit) {
    const like = `%${query}%`;
    const [rows] = await db.execute(
      `SELECT
         a.allocation_id, a.variant_id, a.product_id, a.vendor_id,
         a.allocation_price, a.available_qty,
         p.product_name, p.brand_name,
         pv.sku, pv.mrp, pv.sale_price
       FROM flea_market_stock_allocations a
       JOIN eproducts p ON p.product_id = a.product_id
       JOIN product_variants pv ON pv.variant_id = a.variant_id
       WHERE a.schedule_id = ? AND a.status = 'active' AND a.available_qty > 0
         AND (p.product_name LIKE ? OR pv.sku LIKE ? OR p.brand_name LIKE ?)
       LIMIT ?`,
      [scheduleId, like, like, like, limit],
    );
    return rows;
  }

  // For the barcode scan endpoint — unlike findActiveByScheduleId, this
  // doesn't pre-filter by status/available_qty, so the caller can distinguish
  // "not active" from "out of stock" from "found and sellable" itself.
  async findByIdForScan(allocationId) {
    const [rows] = await db.execute(
      `SELECT
         a.allocation_id, a.variant_id, a.product_id, a.vendor_id, a.status, a.available_qty, a.allocation_price,
         p.product_name, p.brand_name,
         pv.sku, pv.mrp, pv.sale_price
       FROM flea_market_stock_allocations a
       JOIN eproducts p ON p.product_id = a.product_id
       JOIN product_variants pv ON pv.variant_id = a.variant_id
       WHERE a.allocation_id = ?`,
      [allocationId],
    );
    return rows[0];
  }

  async findActiveByScheduleAndVariant(scheduleId, variantId, conn = db) {
    const [rows] = await conn.execute(
      `SELECT * FROM flea_market_stock_allocations WHERE schedule_id = ? AND variant_id = ? AND status = 'active'`,
      [scheduleId, variantId],
    );
    return rows[0];
  }

  // Conditional on the row lock's own read of available_qty (checked by the
  // caller before this runs) — the WHERE clause is a second guard against a
  // concurrent sale slipping in between the lock and this write.
  async recordSale(allocationId, qty, conn) {
    const [result] = await conn.execute(
      `UPDATE flea_market_stock_allocations
       SET sold_qty = sold_qty + ?
       WHERE allocation_id = ? AND available_qty >= ?`,
      [qty, allocationId, qty],
    );
    return result.affectedRows > 0;
  }

  async recordDamage(allocationId, qty, conn) {
    await conn.execute(`UPDATE flea_market_stock_allocations SET damaged_qty = damaged_qty + ? WHERE allocation_id = ?`, [
      qty,
      allocationId,
    ]);
  }

  // Manual correction to the allocated total (physical recount) — the only
  // free variable available_qty is derived from, so this is what "adjustment"
  // actually moves. Positive delta = found more than the ledger shows,
  // negative = found less. Never touches sold/damaged directly.
  async adjustAllocatedQty(allocationId, delta, conn) {
    await conn.execute(`UPDATE flea_market_stock_allocations SET allocated_qty = allocated_qty + ? WHERE allocation_id = ?`, [
      delta,
      allocationId,
    ]);
  }

  // Locks every open allocation for the event at once ahead of the close-out
  // transaction, so no sale/damage can land on them mid-close.
  async findOpenByScheduleIdForUpdate(scheduleId, conn) {
    const [rows] = await conn.execute(
      `SELECT * FROM flea_market_stock_allocations
       WHERE schedule_id = ? AND status IN ('allocated', 'active')
       FOR UPDATE`,
      [scheduleId],
    );
    return rows;
  }

  async closeAllocation(allocationId, returnedQty, conn) {
    await conn.execute(
      `UPDATE flea_market_stock_allocations SET returned_qty = ?, status = 'closed' WHERE allocation_id = ?`,
      [returnedQty, allocationId],
    );
  }

  async activateForSchedule(scheduleId, conn = db) {
    await conn.execute(`UPDATE flea_market_stock_allocations SET status = 'active' WHERE schedule_id = ? AND status = 'allocated'`, [
      scheduleId,
    ]);
  }

  async insertLog({ allocationId, action, quantity, remarks, createdBy }, conn) {
    await conn.execute(
      `INSERT INTO flea_market_stock_logs (allocation_id, action, quantity, remarks, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [allocationId, action, quantity, remarks ?? null, createdBy ?? null],
    );
  }

  async findLogsForAllocation(allocationId) {
    const [rows] = await db.execute(
      `SELECT * FROM flea_market_stock_logs WHERE allocation_id = ? ORDER BY created_at DESC`,
      [allocationId],
    );
    return rows;
  }
}

module.exports = new AllocationModel();
