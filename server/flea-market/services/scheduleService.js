const db = require("../../config/database");
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

    if (startTime && endTime && startTime >= endTime) throw createError(400, "endTime must be after startTime");
    const conn = await db.getConnection();
    let scheduleId;
    try {
      await conn.beginTransaction();
      // All creates for the same location serialize even when the date has no row yet.
      await conn.execute("SELECT location_id FROM flea_market_locations WHERE location_id=? FOR UPDATE", [resolvedLocationId]);
      const existing = await scheduleModel.findActiveForLocationAndDate(resolvedLocationId, scheduledDate, conn);
      if (existing) throw createError(409, "This location already has a non-cancelled event for that date");
      scheduleId = await scheduleModel.create({companyId,locationId:resolvedLocationId,scheduledDate,startTime,endTime,notes,createdBy},conn);
      await conn.commit();
    } catch(error) { await conn.rollback(); throw error; } finally { conn.release(); }

    const rows = await scheduleModel.list(scheduledDate, undefined);
    const created = rows.find((row) => row.schedule_id === scheduleId);
    return created ? mapRow(created) : null;
  }

  async updateSchedule(scheduleId, { status, startTime, endTime, notes }) {
    const conn = await db.getConnection();
    let current;
    try {
      await conn.beginTransaction();
      [[current]] = await conn.execute("SELECT * FROM flea_market_schedules WHERE schedule_id=? FOR UPDATE",[scheduleId]);
      if (!current) throw createError(404,"Event not found");
      if (status !== undefined && status !== current.status && !(VALID_TRANSITIONS[current.status]||[]).includes(status)) throw createError(400,"Invalid event status transition");
      const start = startTime === undefined ? current.start_time : startTime;
      const end = endTime === undefined ? current.end_time : endTime;
      if (start && end && start >= end) throw createError(400,"endTime must be after startTime");
      if (status === 'completed' || status === 'cancelled') {
        const [pools] = await conn.execute("SELECT DISTINCT pool_id FROM flea_market_event_products WHERE schedule_id=? ORDER BY pool_id",[scheduleId]);
        for (const pool of pools) await conn.execute("SELECT pool_id FROM flea_market_vendor_stock WHERE pool_id=? FOR UPDATE",[pool.pool_id]);
        await conn.execute("UPDATE flea_market_event_products SET released_qty=assigned_qty-sold_qty,status='released' WHERE schedule_id=? AND status='active'",[scheduleId]);
      }
      await scheduleModel.update(scheduleId,{status,startTime,endTime,notes},conn);
      await conn.commit();
    } catch(error) { await conn.rollback(); throw error; } finally { conn.release(); }

    const rows = await scheduleModel.list(current.scheduled_date, undefined);
    const updated = rows.find((row) => row.schedule_id === scheduleId);
    return updated ? mapRow(updated) : null;
  }

  async deleteSchedule(scheduleId) {
    const conn=await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[current]]=await conn.execute('SELECT status FROM flea_market_schedules WHERE schedule_id=? FOR UPDATE',[scheduleId]);
      if (!current) throw createError(404,'Event not found');
      if (current.status!=='scheduled') throw createError(409,'Only scheduled events can be deleted; cancel instead');
      const [[history]]=await conn.execute('SELECT id FROM flea_market_event_vendors WHERE schedule_id=? LIMIT 1',[scheduleId]);
      if (history) throw createError(409,'Event has participation history; cancel it to retain history');
      await conn.execute('DELETE FROM flea_market_schedules WHERE schedule_id=?',[scheduleId]);
      await conn.commit();
    } catch(error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }
}

module.exports = new ScheduleService();
