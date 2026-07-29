const allocationService = require("../services/allocationService");

function sendServiceError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error("[flea-market][allocation] error:", error);
  }
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? fallbackMessage : error.message,
  });
}

function parseScheduleId(req, res) {
  const scheduleId = Number(req.query.schedule_id ?? req.params.scheduleId);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    res.status(400).json({ success: false, message: "schedule_id must be a positive integer" });
    return null;
  }
  return scheduleId;
}

class AllocationController {
  async list(req, res) {
    try {
      const scheduleId = parseScheduleId(req, res);
      if (scheduleId === null) return;

      const data = await allocationService.listForSchedule(scheduleId);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch allocations");
    }
  }

  async allocate(req, res) {
    try {
      const { scheduleId, vendorId, productId, variantId, allocatedQty, allocationPrice } = req.body;

      const data = await allocationService.allocate({
        scheduleId,
        vendorId,
        productId,
        variantId,
        allocatedQty,
        allocationPrice,
        // No operator auth exists on this module yet — see requireFleaMarketSession
        // comment elsewhere; left null until one is wired up.
        allocatedBy: null,
      });

      return res.status(201).json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to allocate stock");
    }
  }

  async recordDamage(req, res) {
    try {
      const allocationId = Number(req.params.allocationId);
      const { quantity, remarks } = req.body;

      const data = await allocationService.recordDamage(allocationId, quantity, remarks, null);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to record damage");
    }
  }

  async adjust(req, res) {
    try {
      const allocationId = Number(req.params.allocationId);
      const { quantity, remarks } = req.body;

      const data = await allocationService.adjust(allocationId, quantity, remarks, null);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to apply adjustment");
    }
  }

  async logs(req, res) {
    try {
      const allocationId = Number(req.params.allocationId);
      const data = await allocationService.logsForAllocation(allocationId);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch allocation logs");
    }
  }

  async reconciliationPreview(req, res) {
    try {
      const scheduleId = parseScheduleId(req, res);
      if (scheduleId === null) return;

      const data = await allocationService.reconciliationPreview(scheduleId);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to build reconciliation preview");
    }
  }

  async close(req, res) {
    try {
      const scheduleId = parseScheduleId(req, res);
      if (scheduleId === null) return;

      const data = await allocationService.closeSchedule(scheduleId);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to close event");
    }
  }
}

module.exports = new AllocationController();
