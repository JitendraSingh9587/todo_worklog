const { createLogger } = require("../logger");

const logger = createLogger();

const MIN_CALENDAR_YEAR = 2026;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function buildYearDays(year) {
  const days = [];
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year, 11, 31);
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) {
    const dt = new Date(t);
    const month = dt.getUTCMonth() + 1;
    const day = dt.getUTCDate();
    const weekday = WEEKDAYS[dt.getUTCDay()];
    const isWeekend = weekday === "Saturday" || weekday === "Sunday";
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    days.push({
      date,
      year,
      month,
      monthName: MONTH_NAMES[month - 1],
      day,
      weekday,
      isHoliday: isWeekend,
      holidayReason: isWeekend ? "weekend" : null,
      holidayTitle: null,
      dailyUpdate: "",
      timeSpend: 8,
      clientId: null,
    });
  }
  return days;
}

async function yearDayCount(pool, year) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM calendar_days WHERE year = ?",
    [year],
  );
  return Number(rows[0].n) || 0;
}

function currentCalendarYear() {
  return Math.max(new Date().getFullYear(), MIN_CALENDAR_YEAR);
}

/**
 * A missing year may be created only for the current year, or the year after
 * one that already has rows (December → next year).
 * @param {import("mysql2/promise").Pool} pool
 * @param {number} year
 */
async function mayCreateYear(pool, year) {
  if (!Number.isInteger(year) || year < MIN_CALENDAR_YEAR || year > 2100) {
    return false;
  }
  if (year === currentCalendarYear()) return true;
  return (await yearDayCount(pool, year - 1)) > 0;
}

/**
 * Insert a generated year only if that year has zero rows.
 * Never updates existing calendar_days.
 * @param {import("mysql2/promise").Pool} pool
 * @param {number} year
 * @returns {Promise<boolean>} true when a year was inserted
 */
async function ensureYearDays(pool, year) {
  if (!Number.isInteger(year) || year < MIN_CALENDAR_YEAR || year > 2100) {
    return false;
  }
  if ((await yearDayCount(pool, year)) > 0) {
    return false;
  }
  const days = buildYearDays(year);
  const rows = days.map((d) => [
    d.date,
    d.year,
    d.month,
    d.monthName,
    d.day,
    d.weekday,
    d.isHoliday ? 1 : 0,
    d.holidayReason,
    d.holidayTitle,
    d.dailyUpdate,
    d.timeSpend,
    d.clientId,
  ]);
  for (const part of chunk(rows, 100)) {
    await pool.query(
      `INSERT INTO calendar_days (
        date, year, month, month_name, day, weekday,
        is_holiday, holiday_reason, holiday_title, daily_update, time_spend, client_id
      ) VALUES ?`,
      [part],
    );
  }
  logger.info("Generated calendar year", { year, count: rows.length });
  return true;
}

/**
 * Create the year if allowed (current, or sequential next). No-op if it exists.
 * @param {import("mysql2/promise").Pool} pool
 * @param {number} year
 */
async function ensureYearIfAllowed(pool, year) {
  if ((await yearDayCount(pool, year)) > 0) return false;
  if (!(await mayCreateYear(pool, year))) return false;
  return ensureYearDays(pool, year);
}

/**
 * First start: current year only. Later years are created when next-month
 * requests the following year.
 * @param {import("mysql2/promise").Pool} pool
 */
async function ensureDefaultYearRange(pool) {
  const year = currentCalendarYear();
  const created = await ensureYearIfAllowed(pool, year);
  if (!created) {
    logger.info("Current calendar year already present; no days inserted", {
      year,
    });
  }
  return created ? [year] : [];
}

module.exports = {
  MIN_CALENDAR_YEAR,
  buildYearDays,
  yearDayCount,
  mayCreateYear,
  ensureYearDays,
  ensureYearIfAllowed,
  ensureDefaultYearRange,
  currentCalendarYear,
};
