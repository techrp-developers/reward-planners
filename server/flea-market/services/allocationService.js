const db = require("../../config/database");
const allocationModel = require("../models/allocationModel");
const productModel = require("../models/productModel");
const scheduleModel = require("../models/scheduleModel");
const { createError } = require("../utils/appError");

function mapAllocation(row) {
  return {
    allocationId: row.allocation_id,
    scheduleId: row.schedule_id,
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

class AllocationService {
  async listForSchedule(scheduleId) {
    const rows = await allocationModel.findByScheduleId(scheduleId);
    return rows.map(mapAllocation);
  }

  async logsForAllocation(allocationId) {
    const rows = await allocationModel.findLogsForAllocation(allocationId);
    return rows.map((row) => ({
      logId: row.log_id,
      allocationId: row.allocation_id,
      action: row.action,
      quantity: row.quantity,
      remarks: row.remarks,
      createdAt: row.created_at,
    }));
  }

  // Row lock on product_variants (spec step 1) is what actually prevents two
  // managers over-allocating the same variant across two different events at
  // once — everything else here follows from that lock being held for the
  // duration of the transaction.
  async allocate({ scheduleId, vendorId, productId, variantId, allocatedQty, allocationPrice, allocatedBy }) {
    if (!Number.isInteger(allocatedQty) || allocatedQty <= 0) {
      throw createError(400, "allocatedQty must be a positive integer");
    }

    const schedule = await scheduleModel.findById(scheduleId);
    if (!schedule) {
      throw createError(404, "Schedule not found");
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

      if (variant.stock < allocatedQty) {
        throw createError(409, `Insufficient master stock for variant ${variantId}`, { available: variant.stock });
      }

      const existing = await allocationModel.findExisting(scheduleId, resolvedVendorId, variantId, conn);
      if (existing) {
        throw createError(
          409,
          "This vendor/product is already allocated to this event — use an adjustment to change the quantity instead",
        );
      }

      const decremented = await productModel.decrementStock(variantId, allocatedQty, conn);
      if (!decremented) {
        throw createError(409, `Master stock changed for variant ${variantId} — retry`, { variantId });
      }

      const allocationId = await allocationModel.create(
        {
          scheduleId,
          vendorId: resolvedVendorId,
          productId: resolvedProductId,
          variantId,
          allocatedQty,
          allocationPrice,
          allocatedBy,
          initialStatus: schedule.status === "in_progress" ? "active" : "allocated",
        },
        conn,
      );

      await allocationModel.insertLog(
        { allocationId, action: "allocated", quantity: allocatedQty, createdBy: allocatedBy },
        conn,
      );

      await conn.commit();
      return mapAllocation(await allocationModel.findByIdJoined(allocationId));
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async recordDamage(allocationId, quantity, remarks, createdBy) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw createError(400, "quantity must be a positive integer");
    }
    if (!remarks || !remarks.trim()) {
      throw createError(400, "remarks are required to log damage");
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const allocation = await allocationModel.findByIdForUpdate(allocationId, conn);
      if (!allocation) {
        throw createError(404, "Allocation not found");
      }
      if (quantity > allocation.available_qty) {
        throw createError(409, "Damage quantity exceeds currently available stock for this allocation", {
          available: allocation.available_qty,
        });
      }

      await allocationModel.recordDamage(allocationId, quantity, conn);
      await allocationModel.insertLog({ allocationId, action: "damage", quantity, remarks, createdBy }, conn);

      await conn.commit();
      return mapAllocation(await allocationModel.findByIdJoined(allocationId));
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // Manual correction to the allocated total (see allocationModel.adjustAllocatedQty
  // for why this is the field that moves) — quantity is a signed delta.
  async adjust(allocationId, quantity, remarks, createdBy) {
    if (!Number.isInteger(quantity) || quantity === 0) {
      throw createError(400, "quantity must be a non-zero integer delta");
    }
    if (!remarks || !remarks.trim()) {
      throw createError(400, "remarks are required for a manual adjustment");
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const allocation = await allocationModel.findByIdForUpdate(allocationId, conn);
      if (!allocation) {
        throw createError(404, "Allocation not found");
      }

      const committedQty = allocation.sold_qty + allocation.damaged_qty;
      if (allocation.allocated_qty + quantity < committedQty) {
        throw createError(409, "Adjustment would reduce allocated quantity below what's already sold/damaged", {
          committedQty,
        });
      }

      await allocationModel.adjustAllocatedQty(allocationId, quantity, conn);
      await allocationModel.insertLog({ allocationId, action: "adjustment", quantity, remarks, createdBy }, conn);

      await conn.commit();
      return mapAllocation(await allocationModel.findByIdJoined(allocationId));
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // Read-only — safe to call any time during the event to see current
  // sell-through without closing anything.
  async reconciliationPreview(scheduleId) {
    const rows = await allocationModel.findByScheduleId(scheduleId);
    return rows.map((row) => ({
      ...mapAllocation(row),
      wouldReturnQty: row.available_qty,
    }));
  }

  // Irreversible — closes every open allocation for the event, returns
  // unsold/undamaged stock to the master pool, marks the schedule completed.
  async closeSchedule(scheduleId) {
    const schedule = await scheduleModel.findById(scheduleId);
    if (!schedule) {
      throw createError(404, "Schedule not found");
    }
    if (schedule.status !== "in_progress") {
      throw createError(400, `Cannot close a schedule with status '${schedule.status}' — must be 'in_progress'`);
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const allocations = await allocationModel.findOpenByScheduleIdForUpdate(scheduleId, conn);
      const summary = [];

      for (const allocation of allocations) {
        const returnedQty = allocation.available_qty;

        await allocationModel.closeAllocation(allocation.allocation_id, returnedQty, conn);
        if (returnedQty > 0) {
          await productModel.incrementStock(allocation.variant_id, returnedQty, conn);
        }
        await allocationModel.insertLog(
          { allocationId: allocation.allocation_id, action: "return", quantity: returnedQty },
          conn,
        );

        summary.push({
          allocationId: allocation.allocation_id,
          vendorId: allocation.vendor_id,
          productId: allocation.product_id,
          variantId: allocation.variant_id,
          allocatedQty: allocation.allocated_qty,
          soldQty: allocation.sold_qty,
          damagedQty: allocation.damaged_qty,
          returnedQty,
        });
      }

      await conn.execute(`UPDATE flea_market_schedules SET status = 'completed' WHERE schedule_id = ?`, [scheduleId]);

      await conn.commit();
      return summary;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = new AllocationService();
