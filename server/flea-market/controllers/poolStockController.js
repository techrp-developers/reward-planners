const poolStockService = require("../services/poolStockService");

function sendServiceError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error("[flea-market][vendor-stock] error:", error);
  }
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? fallbackMessage : error.message,
  });
}

class PoolStockController {
  // Unscoped — every vendor stock pool, regardless of which event it was
  // topped up during (pools persist across events now).
  async list(req, res) {
    try {
      const data = await poolStockService.listAll();
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch vendor stock pools");
    }
  }

  async topUp(req, res) {
    try {
      const { vendorId, productId, variantId, allocatedQty, allocationPrice, scheduleId } = req.body;

      const data = await poolStockService.topUp({
        vendorId,
        productId,
        variantId,
        qty: allocatedQty,
        allocationPrice,
        scheduleId,
        // No operator auth exists on this module yet — see requireFleaMarketSession
        // comment elsewhere; left null until one is wired up.
        allocatedBy: null,
      });

      return res.status(201).json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to top up stock");
    }
  }

  async recordDamage(req, res) {
    try {
      const poolId = Number(req.params.poolId);
      const { quantity, remarks, scheduleId } = req.body;

      const data = await poolStockService.recordDamage(poolId, quantity, remarks, null, scheduleId);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to record damage");
    }
  }

  async adjust(req, res) {
    try {
      const poolId = Number(req.params.poolId);
      const { quantity, remarks } = req.body;

      const data = await poolStockService.adjust(poolId, quantity, remarks, null);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to apply adjustment");
    }
  }

  async returnToVendor(req, res) {
    try {
      const poolId = Number(req.params.poolId);
      const { returnQty, remarks, closePool } = req.body;

      const data = await poolStockService.returnToVendor(poolId, returnQty, remarks, null, Boolean(closePool));
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to return stock to vendor");
    }
  }

  async updatePrice(req, res) {
    try {
      const poolId = Number(req.params.poolId);
      const { allocationPrice } = req.body;

      const data = await poolStockService.updateAllocationPrice(poolId, allocationPrice);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to update allocation price");
    }
  }

  async remove(req, res) {
    try {
      const poolId = Number(req.params.poolId);
      await poolStockService.deletePool(poolId);
      return res.json({ success: true });
    } catch (error) {
      return sendServiceError(res, error, "Failed to delete pool");
    }
  }

  async logs(req, res) {
    try {
      const poolId = Number(req.params.poolId);
      const data = await poolStockService.logsForPool(poolId);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch pool logs");
    }
  }

  // "How did THIS specific event perform" — read-only, doesn't close or
  // gate anything, sourced from flea_market_stock_logs.
  async eventSummary(req, res) {
    try {
      const scheduleId = Number(req.params.scheduleId);
      if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
        return res.status(400).json({ success: false, message: "scheduleId must be a positive integer" });
      }

      const data = await poolStockService.getEventSummary(scheduleId);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to build event summary");
    }
  }
}

module.exports = new PoolStockController();
