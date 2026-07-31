const db = require("../../config/database");
const poolStockModel = require("../models/poolStockModel");
const productModel = require("../models/productModel");
const scheduleModel = require("../models/scheduleModel");
const { createError } = require("../utils/appError");

function mapPool(row) {
  return {
    poolId: row.pool_id,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    productId: row.product_id,
    productName: row.product_name,
    variantId: row.variant_id,
    sku: row.sku,
    allocatedQty: row.allocated_qty,
    soldQty: row.sold_qty,
    damagedQty: row.damaged_qty,
    returnedQty: row.returned_qty,
    availableQty: row.available_qty,
    allocationPrice: row.allocation_price != null ? Number(row.allocation_price) : null,
    status: row.status,
  };
}

// Top-up/damage logs are only tied to a specific event when that event is
// actually live right now — a manager topping up stock while looking at a
// 'scheduled' (not started) or 'completed' event's page is a warehouse-level
// action between events, not something that happened "during" that event.
async function resolveLogScheduleId(scheduleId) {
  if (!scheduleId) return null;
  const schedule = await scheduleModel.findById(scheduleId);
  return schedule && schedule.status === "in_progress" ? scheduleId : null;
}

class PoolStockService {
  async listAll() {
    const rows = await poolStockModel.findAll();
    return rows.map(mapPool);
  }

  async logsForPool(poolId) {
    const rows = await poolStockModel.findLogsForPool(poolId);
    return rows.map((row) => ({
      logId: row.log_id,
      poolId: row.pool_id,
      scheduleId: row.schedule_id,
      action: row.action,
      quantity: row.quantity,
      remarks: row.remarks,
      createdAt: row.created_at,
    }));
  }

  // Row lock on product_variants is what actually prevents two managers
  // over-committing the same variant's master stock at once — everything
  // else here follows from that lock being held for the transaction.
  // Creates the pool on first top-up for this vendor+variant, or adds to the
  // existing pool otherwise (never a new row per event, unlike the old model).
  async topUp({ vendorId, productId, variantId, qty, allocationPrice, allocatedBy, scheduleId }) {
    if (!Number.isInteger(qty) || qty <= 0) {
      throw createError(400, "qty must be a positive integer");
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const variant = await productModel.findVariantForUpdate(variantId, conn);
      if (!variant) {
        throw createError(404, `Variant ${variantId} not found`);
      }
      // Derived from the locked row, not trusted from the client — mirrors
      // checkoutService's "never trust client price/points" rule.
      const resolvedVendorId = vendorId || variant.vendor_id;
      const resolvedProductId = productId || variant.product_id;

      if (variant.stock < qty) {
        throw createError(409, `Insufficient master stock for variant ${variantId}`, { available: variant.stock });
      }

      const decremented = await productModel.decrementStock(variantId, qty, conn);
      if (!decremented) {
        throw createError(409, `Master stock changed for variant ${variantId} — retry`, { variantId });
      }

      const pool = await poolStockModel.upsertTopUp(
        { vendorId: resolvedVendorId, productId: resolvedProductId, variantId, qty, allocationPrice, allocatedBy },
        conn,
      );

      const logScheduleId = await resolveLogScheduleId(scheduleId);
      await poolStockModel.insertLog(
        { poolId: pool.pool_id, action: "allocated", quantity: qty, createdBy: allocatedBy, scheduleId: logScheduleId },
        conn,
      );

      await conn.commit();
      return mapPool(await poolStockModel.findByIdJoined(pool.pool_id));
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async recordDamage(poolId, quantity, remarks, createdBy, scheduleId) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw createError(400, "quantity must be a positive integer");
    }
    if (!remarks || !remarks.trim()) {
      throw createError(400, "remarks are required to log damage");
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const pool = await poolStockModel.findByIdForUpdate(poolId, conn);
      if (!pool) {
        throw createError(404, "Pool not found");
      }
      if (quantity > pool.available_qty) {
        throw createError(409, "Damage quantity exceeds currently available stock for this pool", {
          available: pool.available_qty,
        });
      }

      await poolStockModel.recordDamage(poolId, quantity, conn);
      const logScheduleId = await resolveLogScheduleId(scheduleId);
      await poolStockModel.insertLog(
        { poolId, action: "damage", quantity, remarks, createdBy, scheduleId: logScheduleId },
        conn,
      );

      await conn.commit();
      return mapPool(await poolStockModel.findByIdJoined(poolId));
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // Manual correction to the pool's allocated total (see
  // poolStockModel.adjustAllocatedQty for why this is the field that moves)
  // — quantity is a signed delta. Not tied to any event.
  async adjust(poolId, quantity, remarks, createdBy) {
    if (!Number.isInteger(quantity) || quantity === 0) {
      throw createError(400, "quantity must be a non-zero integer delta");
    }
    if (!remarks || !remarks.trim()) {
      throw createError(400, "remarks are required for a manual adjustment");
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const pool = await poolStockModel.findByIdForUpdate(poolId, conn);
      if (!pool) {
        throw createError(404, "Pool not found");
      }

      const committedQty = pool.sold_qty + pool.damaged_qty + pool.returned_qty;
      if (pool.allocated_qty + quantity < committedQty) {
        throw createError(409, "Adjustment would reduce allocated quantity below what's already sold/damaged/returned", {
          committedQty,
        });
      }

      await poolStockModel.adjustAllocatedQty(poolId, quantity, conn);
      await poolStockModel.insertLog({ poolId, action: "adjustment", quantity, remarks, createdBy }, conn);

      await conn.commit();
      return mapPool(await poolStockModel.findByIdJoined(poolId));
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // Explicit end-of-program action — NOT triggered by any event closing
  // anymore, since the pool persists across events. Only happens when the
  // vendor is done with the whole program and wants remaining stock back.
  async returnToVendor(poolId, returnQty, remarks, allocatedBy, closePoolAfter) {
    if (!Number.isInteger(returnQty) || returnQty <= 0) {
      throw createError(400, "returnQty must be a positive integer");
    }
    if (!remarks || !remarks.trim()) {
      throw createError(400, "remarks are required for a return to vendor");
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const pool = await poolStockModel.findByIdForUpdate(poolId, conn);
      if (!pool) {
        throw createError(404, "Pool not found");
      }
      if (returnQty > pool.available_qty) {
        throw createError(409, "Return quantity exceeds currently available stock for this pool", {
          available: pool.available_qty,
        });
      }

      const returned = await poolStockModel.recordReturn(poolId, returnQty, conn);
      if (!returned) {
        throw createError(409, "Pool stock changed — retry");
      }

      // Stock physically leaves the flea market and goes back to the
      // vendor's master warehouse pool.
      await productModel.incrementStock(pool.variant_id, returnQty, conn);
      await poolStockModel.insertLog(
        { poolId, action: "return", quantity: returnQty, remarks, createdBy: allocatedBy },
        conn,
      );

      if (closePoolAfter) {
        const updated = await poolStockModel.findById(poolId, conn);
        if (updated.available_qty === 0) {
          await poolStockModel.closePool(poolId, conn);
        }
      }

      await conn.commit();
      return mapPool(await poolStockModel.findByIdJoined(poolId));
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // Price-only edit — the qty/status fields aren't touched, so no row lock
  // or log entry is needed (unlike every quantity-moving action above).
  async updateAllocationPrice(poolId, allocationPrice) {
    if (allocationPrice != null && (typeof allocationPrice !== "number" || allocationPrice < 0)) {
      throw createError(400, "allocationPrice must be a non-negative number");
    }

    const pool = await poolStockModel.findById(poolId);
    if (!pool) {
      throw createError(404, "Pool not found");
    }

    await poolStockModel.updateAllocationPrice(poolId, allocationPrice ?? null);
    return mapPool(await poolStockModel.findByIdJoined(poolId));
  }

  // Only safe to hard-delete a pool that has no history — anything sold,
  // damaged, or returned needs to stay for reporting, so those pools must be
  // returned-to-vendor instead. Reverses whatever's still allocated back to
  // the vendor's master stock so the delete doesn't silently destroy stock.
  async deletePool(poolId) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const pool = await poolStockModel.findByIdForUpdate(poolId, conn);
      if (!pool) {
        throw createError(404, "Pool not found");
      }
      if (pool.sold_qty > 0 || pool.damaged_qty > 0 || pool.returned_qty > 0) {
        throw createError(409, "Cannot delete a pool with sale, damage, or return history — use Return to Vendor instead");
      }

      if (pool.allocated_qty > 0) {
        await productModel.incrementStock(pool.variant_id, pool.allocated_qty, conn);
      }
      await poolStockModel.deletePool(poolId, conn);

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // Read-only — "how did THIS specific event perform," sourced from the log
  // table (which action happened under which schedule_id), not from the
  // pool table itself (pools aren't per-event anymore, so there's nothing to
  // close or reconcile when one event in the sequence ends).
  async getEventSummary(scheduleId) {
    const schedule = await scheduleModel.findById(scheduleId);
    if (!schedule) {
      throw createError(404, "Schedule not found");
    }

    const rows = await poolStockModel.getEventSummary(scheduleId);

    const byKey = new Map();
    for (const row of rows) {
      const key = `${row.vendor_id}:${row.variant_id}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          vendorId: row.vendor_id,
          vendorName: row.vendor_name,
          productId: row.product_id,
          productName: row.product_name,
          variantId: row.variant_id,
          sku: row.sku,
          soldQty: 0,
          damagedQty: 0,
        });
      }
      const entry = byKey.get(key);
      if (row.action === "sale") entry.soldQty = Number(row.total_quantity);
      if (row.action === "damage") entry.damagedQty = Number(row.total_quantity);
    }

    return Array.from(byKey.values());
  }
}

module.exports = new PoolStockService();
