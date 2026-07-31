const scheduleService = require("../services/scheduleService");

function sendServiceError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error("[flea-market][schedule] error:", error);
  }
  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? fallbackMessage : error.message,
  });
}

class ScheduleController {
  async list(req, res) {
    try {
      const date = req.query.date ? String(req.query.date) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;

      const data = await scheduleService.listSchedules(date, status);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch schedules");
    }
  }

  async getById(req, res) {
    try {
      const scheduleId = Number(req.params.scheduleId);
      if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
        return res.status(400).json({ success: false, message: "scheduleId must be a positive integer" });
      }

      const data = await scheduleService.getById(scheduleId);
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch schedule entry");
    }
  }

  async todayActive(req, res) {
    try {
      const data = await scheduleService.getTodayActive();
      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to fetch today's active schedules");
    }
  }

  async create(req, res) {
    try {
      const { companyId, locationId, locationName, scheduledDate, startTime, endTime, notes } = req.body;

      const data = await scheduleService.createSchedule({
        companyId,
        locationId,
        locationName,
        scheduledDate,
        startTime,
        endTime,
        notes,
        // No real operator auth exists on this module yet (see requireFleaMarketSession —
        // that's customer OTP session auth, not an admin/operator login), so this is
        // left null until one is wired up.
        createdBy: null,
      });

      return res.status(201).json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to create schedule entry");
    }
  }

  async update(req, res) {
    try {
      const scheduleId = Number(req.params.scheduleId);
      if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
        return res.status(400).json({ success: false, message: "scheduleId must be a positive integer" });
      }

      const { status, startTime, endTime, notes } = req.body;
      const data = await scheduleService.updateSchedule(scheduleId, { status, startTime, endTime, notes });

      return res.json({ success: true, data });
    } catch (error) {
      return sendServiceError(res, error, "Failed to update schedule entry");
    }
  }

  async remove(req, res) {
    try {
      const scheduleId = Number(req.params.scheduleId);
      if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
        return res.status(400).json({ success: false, message: "scheduleId must be a positive integer" });
      }

      await scheduleService.deleteSchedule(scheduleId);
      return res.json({ success: true, message: "Schedule entry deleted" });
    } catch (error) {
      return sendServiceError(res, error, "Failed to delete schedule entry");
    }
  }
}

module.exports = new ScheduleController();
