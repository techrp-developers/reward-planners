const db = require("../../config/database");

const ACTIVE_STATUSES = ["scheduled", "in_progress"];

class ScheduleModel {
  async list(date, status) {
    const conditions = [];
    const params = [];

    if (date) {
      conditions.push("fs.scheduled_date = ?");
      params.push(date);
    }

    if (status) {
      conditions.push("fs.status = ?");
      params.push(status);
    }

    const [rows] = await db.execute(
      `SELECT fs.*, c.company_name, fl.name AS location_name
       FROM flea_market_schedules fs
       JOIN companies c ON c.company_id = fs.company_id
       JOIN flea_market_locations fl ON fl.location_id = fs.location_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY fs.scheduled_date DESC, fs.start_time ASC`,
      params,
    );
    return rows;
  }

  async findTodayActive() {
    const [rows] = await db.execute(
      `SELECT fs.*, c.company_name, fl.name AS location_name
       FROM flea_market_schedules fs
       JOIN companies c ON c.company_id = fs.company_id
       JOIN flea_market_locations fl ON fl.location_id = fs.location_id
       WHERE fs.scheduled_date = CURDATE() AND fs.status IN ('scheduled', 'in_progress')
       ORDER BY fs.start_time ASC`,
    );
    return rows;
  }

  async findById(scheduleId) {
    const [rows] = await db.execute(`SELECT * FROM flea_market_schedules WHERE schedule_id = ?`, [scheduleId]);
    return rows[0];
  }

  // Joined variant of findById — for contexts that need company/location
  // names to display (e.g. the allocation page header), not just raw ids.
  async findByIdJoined(scheduleId) {
    const [rows] = await db.execute(
      `SELECT fs.*, c.company_name, fl.name AS location_name
       FROM flea_market_schedules fs
       JOIN companies c ON c.company_id = fs.company_id
       JOIN flea_market_locations fl ON fl.location_id = fs.location_id
       WHERE fs.schedule_id = ?`,
      [scheduleId],
    );
    return rows[0];
  }

  // "One flea market per location per day" — any non-cancelled entry blocks a new one.
  async findActiveForLocationAndDate(locationId, scheduledDate) {
    const [rows] = await db.execute(
      `SELECT * FROM flea_market_schedules
       WHERE location_id = ? AND scheduled_date = ? AND status != 'cancelled'`,
      [locationId, scheduledDate],
    );
    return rows[0];
  }

  // The billing-start gate: is there a schedule for this location, today, that's
  // currently active and (if times are set) within the scheduled window?
  async findGateEntryForLocationToday(locationId) {
    const [rows] = await db.execute(
      `SELECT * FROM flea_market_schedules
       WHERE location_id = ?
         AND scheduled_date = CURDATE()
         AND status IN (${ACTIVE_STATUSES.map(() => "?").join(",")})
         AND (start_time IS NULL OR CURTIME() >= start_time)
         AND (end_time IS NULL OR CURTIME() <= end_time)
       LIMIT 1`,
      [locationId, ...ACTIVE_STATUSES],
    );
    return rows[0];
  }

  async create({ companyId, locationId, scheduledDate, startTime, endTime, notes, createdBy }) {
    const [result] = await db.execute(
      `INSERT INTO flea_market_schedules
        (company_id, location_id, scheduled_date, start_time, end_time, notes, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      [companyId, locationId, scheduledDate, startTime || null, endTime || null, notes || null, createdBy || null],
    );
    return result.insertId;
  }

  async update(scheduleId, fields) {
    const columns = [];
    const params = [];

    if (fields.status !== undefined) {
      columns.push("status = ?");
      params.push(fields.status);
    }
    if (fields.startTime !== undefined) {
      columns.push("start_time = ?");
      params.push(fields.startTime);
    }
    if (fields.endTime !== undefined) {
      columns.push("end_time = ?");
      params.push(fields.endTime);
    }
    if (fields.notes !== undefined) {
      columns.push("notes = ?");
      params.push(fields.notes);
    }

    if (columns.length === 0) return;

    params.push(scheduleId);
    await db.execute(`UPDATE flea_market_schedules SET ${columns.join(", ")} WHERE schedule_id = ?`, params);
  }

  // Best-effort auto-transition — only fires the scheduled -> in_progress edge.
  async autoStartIfScheduled(locationId) {
    await db.execute(
      `UPDATE flea_market_schedules
       SET status = 'in_progress'
       WHERE location_id = ? AND scheduled_date = CURDATE() AND status = 'scheduled'`,
      [locationId],
    );
  }

  async delete(scheduleId) {
    const [result] = await db.execute(`DELETE FROM flea_market_schedules WHERE schedule_id = ?`, [scheduleId]);
    return result.affectedRows > 0;
  }
}

module.exports = new ScheduleModel();
