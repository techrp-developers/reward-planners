const locationModel = require("../models/locationModel");
const scheduleModel = require("../models/scheduleModel");
const { createError } = require("../utils/appError");

const VALID_TRANSITIONS = {
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function mapRow(row) {
  return {
    scheduleId: row.schedule_id,
    companyId: row.company_id,
    companyName: row.company_name,
    locationId: row.location_id,
    locationName: row.location_name,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    notes: row.notes,
  };
}

class ScheduleService {
  async listSchedules(date, status) {
    const rows = await scheduleModel.list(date, status);
    return rows.map(mapRow);
  }

  async getTodayActive() {
    const rows = await scheduleModel.findTodayActive();
    return rows.map(mapRow);
  }

  async getById(scheduleId) {
    const row = await scheduleModel.findByIdJoined(scheduleId);
    if (!row) {
      throw createError(404, "Schedule entry not found");
    }
    return mapRow(row);
  }

  // Resolves a schedule's location from either an existing locationId or a
  // typed locationName — flea_market_schedules.location_id is NOT NULL with a
  // FK to flea_market_locations, so a typed name that doesn't match an
  // existing (active) location gets a new location row created for it rather
  // than relaxing that constraint.
  async resolveLocationId(companyId, locationId, locationName) {
    if (locationId) {
      const location = await locationModel.findByIdAndCompany(locationId, companyId);
      if (!location) {
        throw createError(400, "locationId does not belong to companyId");
      }
      return location.location_id;
    }

    const trimmedName = (locationName || "").trim();
    if (!trimmedName) {
      throw createError(400, "locationId or locationName is required");
    }

    const existing = await locationModel.findActiveByNameAndCompany(companyId, trimmedName);
    if (existing) {
      return existing.location_id;
    }

    return locationModel.create({ companyId, name: trimmedName });
  }

  async createSchedule({ companyId, locationId, locationName, scheduledDate, startTime, endTime, notes, createdBy }) {
    const resolvedLocationId = await this.resolveLocationId(companyId, locationId, locationName);

    const existing = await scheduleModel.findActiveForLocationAndDate(resolvedLocationId, scheduledDate);
    if (existing) {
      throw createError(409, "This location already has a non-cancelled schedule entry for that date");
    }

    const scheduleId = await scheduleModel.create({
      companyId,
      locationId: resolvedLocationId,
      scheduledDate,
      startTime,
      endTime,
      notes,
      createdBy,
    });

    const rows = await scheduleModel.list(scheduledDate, undefined);
    const created = rows.find((row) => row.schedule_id === scheduleId);
    return created ? mapRow(created) : null;
  }

  async updateSchedule(scheduleId, { status, startTime, endTime, notes }) {
    const current = await scheduleModel.findById(scheduleId);
    if (!current) {
      throw createError(404, "Schedule entry not found");
    }

    if (status !== undefined && status !== current.status) {
      const allowed = VALID_TRANSITIONS[current.status] || [];
      if (!allowed.includes(status)) {
        throw createError(400, `Cannot move status from '${current.status}' to '${status}'`);
      }
    }

    await scheduleModel.update(scheduleId, { status, startTime, endTime, notes });

    const rows = await scheduleModel.list(current.scheduled_date, undefined);
    const updated = rows.find((row) => row.schedule_id === scheduleId);
    return updated ? mapRow(updated) : null;
  }

  async deleteSchedule(scheduleId) {
    const current = await scheduleModel.findById(scheduleId);
    if (!current) {
      throw createError(404, "Schedule entry not found");
    }

    if (current.status !== "scheduled") {
      throw createError(400, "Only entries with status 'scheduled' can be deleted — cancel via PATCH instead");
    }

    await scheduleModel.delete(scheduleId);
  }
}

module.exports = new ScheduleService();
