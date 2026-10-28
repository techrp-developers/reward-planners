// Wall-clock <-> UTC conversion for campaign scheduling. Campaign instants are
// stored as UTC DATETIME strings; the RM's timezone only shapes what "9:00 on
// the 1st" means, including for recurring schedules.

const DEFAULT_TIMEZONE = "Asia/Kolkata";

// One explicit zone for employee-facing rules: quiet hours, the promotional
// "per day" limit, and dashboard date filters/analytics. Schedules use the
// campaign's own timezone; every stored instant is UTC.
const EMPLOYEE_TIMEZONE = process.env.NOTIFICATION_EMPLOYEE_TIMEZONE || process.env.SCHEDULE_TIMEZONE || DEFAULT_TIMEZONE;

function isValidTimezone(timeZone) {
  // Intl treats an undefined zone as "use the default", so require a name.
  if (typeof timeZone !== "string" || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function offsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

// Two passes settle the offset across DST transitions in zones that have them.
function wallClockToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = guess - offsetMs(new Date(guess), timeZone);
  utc = guess - offsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

function parseLocalDateTime(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  const t = /^(\d{2}):(\d{2})$/.exec(String(time || ""));
  if (!d || !t) return null;

  const parts = {
    year: Number(d[1]), month: Number(d[2]), day: Number(d[3]),
    hour: Number(t[1]), minute: Number(t[2]),
  };
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (check.getUTCMonth() !== parts.month - 1 || check.getUTCDate() !== parts.day) return null;
  if (parts.hour > 23 || parts.minute > 59) return null;
  return parts;
}

function localToUtc(date, time, timeZone = DEFAULT_TIMEZONE) {
  const parts = parseLocalDateTime(date, time);
  return parts ? wallClockToUtc(parts, timeZone) : null;
}

function toSqlUtc(date) {
  return date ? date.toISOString().slice(0, 19).replace("T", " ") : null;
}

function fromSqlUtc(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(`${String(value).replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Next run of a recurring campaign at the same local wall-clock time.
 * Monthly runs anchored on the 31st fall back to the last day of shorter months.
 */
function nextOccurrence(previousUtc, recurrenceType, timeZone = DEFAULT_TIMEZONE, anchorDay = null) {
  if (!previousUtc || recurrenceType === "none") return null;
  const p = zonedParts(previousUtc, timeZone);

  if (recurrenceType === "daily" || recurrenceType === "weekly") {
    const step = recurrenceType === "daily" ? 1 : 7;
    const next = new Date(Date.UTC(p.year, p.month - 1, p.day + step));
    return wallClockToUtc({
      year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(),
      hour: p.hour, minute: p.minute,
    }, timeZone);
  }

  if (recurrenceType === "monthly") {
    const year = p.month === 12 ? p.year + 1 : p.year;
    const month = p.month === 12 ? 1 : p.month + 1;
    const day = Math.min(anchorDay || p.day, daysInMonth(year, month));
    return wallClockToUtc({ year, month, day, hour: p.hour, minute: p.minute }, timeZone);
  }

  return null;
}

/** Whether another occurrence is allowed after `occurrencesStarted` runs. */
function hasMoreOccurrences({ nextRunUtc, recurrenceEndUtc, maxOccurrences, occurrencesStarted, expiresUtc }) {
  if (!nextRunUtc) return false;
  if (maxOccurrences && occurrencesStarted >= maxOccurrences) return false;
  if (recurrenceEndUtc && nextRunUtc > recurrenceEndUtc) return false;
  if (expiresUtc && nextRunUtc > expiresUtc) return false;
  return true;
}

const pad = (value) => String(value).padStart(2, "0");

/** Minutes since local midnight in `timeZone`. */
function minutesInZone(now = new Date(), timeZone = EMPLOYEE_TIMEZONE) {
  const p = zonedParts(now, timeZone);
  return p.hour * 60 + p.minute;
}

/** UTC instant of local midnight (start of "today") in `timeZone`. */
function startOfDayUtc(now = new Date(), timeZone = EMPLOYEE_TIMEZONE) {
  const p = zonedParts(now, timeZone);
  return localToUtc(`${p.year}-${pad(p.month)}-${pad(p.day)}`, "00:00", timeZone);
}

/** "+05:30"-style offset of `timeZone` at `now`, for SQL CONVERT_TZ. */
function utcOffsetString(timeZone = EMPLOYEE_TIMEZONE, now = new Date()) {
  const minutes = Math.round(offsetMs(now, timeZone) / 60000);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * Dashboard "from"/"to" dates are calendar days in `timeZone`; returns UTC
 * DATETIME bounds [fromUtc, toUtcExclusive) for filtering UTC columns.
 */
function dayRangeUtc(from, to, timeZone = EMPLOYEE_TIMEZONE) {
  const valid = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  const fromUtc = valid(from) ? localToUtc(from, "00:00", timeZone) : null;
  let toUtc = null;
  if (valid(to)) {
    const end = new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)) + 1));
    toUtc = localToUtc(`${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`, "00:00", timeZone);
  }
  return { fromUtc: fromUtc ? toSqlUtc(fromUtc) : null, toUtc: toUtc ? toSqlUtc(toUtc) : null };
}

// created_at/updated_at columns default to NOW() in the MySQL session zone.
const sessionToUtcSql = (column) => `CONVERT_TZ(${column}, @@session.time_zone, '+00:00')`;

module.exports = {
  DEFAULT_TIMEZONE,
  EMPLOYEE_TIMEZONE,
  dayRangeUtc,
  minutesInZone,
  sessionToUtcSql,
  startOfDayUtc,
  utcOffsetString,
  fromSqlUtc,
  hasMoreOccurrences,
  isValidTimezone,
  localToUtc,
  nextOccurrence,
  toSqlUtc,
  zonedParts,
};
