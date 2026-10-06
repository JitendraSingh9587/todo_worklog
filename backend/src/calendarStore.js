const crypto = require("crypto");
const { getPool } = require("./db/pool");
const {
  ensureYearIfAllowed,
  currentCalendarYear,
  MIN_CALENDAR_YEAR,
} = require("./db/calendarYears");

const MAX_DAILY_UPDATE_LENGTH = 50_000;

const DAY_TYPES = new Set(["working", "weekend", "holiday", "leave"]);

const TIME_SPEND_OPTIONS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

const DEFAULT_TIME_SPEND = 8;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const YEAR_ABOUT =
  'dailyUpdate holds work log bullets (newline-separated). holidayReason: "weekend" (Sat/Sun), "holiday" (public holiday), "leave" (leave days), or null (working day).';

function formatDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function rowToDay(row) {
  const day = {
    date: formatDate(row.date),
    month: Number(row.month),
    monthName: row.month_name,
    day: Number(row.day),
    weekday: row.weekday,
    isHoliday: Boolean(row.is_holiday),
    holidayReason: row.holiday_reason,
    dailyUpdate: row.daily_update || "",
    timeSpend: Number(row.time_spend),
  };
  if (row.holiday_title) day.holidayTitle = row.holiday_title;
  if (row.client_id) day.clientId = row.client_id;
  return day;
}

function rowToEntry(row) {
  const entry = {
    entryId: row.entry_id,
    projectId: row.project_id,
    hours: Number(row.hours),
    taskDescription: row.task_description || "",
  };
  if (row.client_id) entry.clientId = row.client_id;
  return entry;
}

/**
 * @param {unknown} raw
 */
function normalizeProjectEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const entries = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const projectId =
      typeof item.projectId === "string" ? item.projectId.trim() : "";
    if (!projectId || !UUID_RE.test(projectId)) continue;
    const hours = normalizeTimeSpend(item.hours);
    const taskDescription =
      typeof item.taskDescription === "string" ? item.taskDescription : "";
    const entryId =
      typeof item.entryId === "string" && UUID_RE.test(item.entryId.trim())
        ? item.entryId.trim()
        : crypto.randomUUID();
    const clientId =
      typeof item.clientId === "string" && UUID_RE.test(item.clientId.trim())
        ? item.clientId.trim()
        : undefined;
    const entry = {
      projectId,
      hours,
      taskDescription,
      entryId,
    };
    if (clientId) entry.clientId = clientId;
    entries.push(entry);
  }
  return entries;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeTimeSpend(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(12, Math.max(0, Math.round(value)));
  }
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d+)\s*hr$/i);
    if (match) {
      return Math.min(12, Math.max(0, parseInt(match[1], 10)));
    }
    const n = Number(value);
    if (Number.isFinite(n)) {
      return Math.min(12, Math.max(0, Math.round(n)));
    }
  }
  return DEFAULT_TIME_SPEND;
}

/** @param {string} dayType */
function applyDayType(dayType) {
  switch (dayType) {
    case "working":
      return { isHoliday: false, holidayReason: null, holidayTitle: null };
    case "weekend":
      return { isHoliday: true, holidayReason: "weekend", holidayTitle: null };
    case "holiday":
      return { isHoliday: true, holidayReason: "holiday" };
    case "leave":
      return { isHoliday: true, holidayReason: "leave", holidayTitle: null };
    default:
      throw new Error(`Invalid dayType: ${dayType}`);
  }
}

/** @param {{ isHoliday: boolean, holidayReason: string | null }} day */
function inferDayType(day) {
  if (!day.isHoliday) return "working";
  if (day.holidayReason === "holiday") return "holiday";
  if (day.holidayReason === "leave") return "leave";
  return "weekend";
}

async function loadEntriesByDate(pool, year) {
  const [rows] = await pool.query(
    `SELECT entry_id, date, project_id, client_id, hours, task_description
     FROM project_entries
     WHERE date >= ? AND date <= ?
     ORDER BY date, entry_id`,
    [`${year}-01-01`, `${year}-12-31`],
  );
  const byDate = new Map();
  for (const row of rows) {
    const date = formatDate(row.date);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(rowToEntry(row));
  }
  return byDate;
}

async function listYears() {
  const pool = getPool();
  await ensureYearIfAllowed(pool, currentCalendarYear());
  const [rows] = await pool.query(
    "SELECT DISTINCT year FROM calendar_days ORDER BY year ASC",
  );
  return rows.map((r) => Number(r.year));
}

async function getYearDocument(year) {
  const pool = getPool();
  await ensureYearIfAllowed(pool, year);
  const [dayRows] = await pool.query(
    `SELECT date, year, month, month_name, day, weekday,
            is_holiday, holiday_reason, holiday_title, daily_update,
            time_spend, client_id
     FROM calendar_days
     WHERE year = ?
     ORDER BY date ASC`,
    [year],
  );
  if (!dayRows.length) {
    const e = new Error(
      year < MIN_CALENDAR_YEAR
        ? `No calendar data for year ${year}`
        : `Year ${year} is not available yet; open it from December of the previous year`,
    );
    e.statusCode = 404;
    throw e;
  }
  const entriesByDate = await loadEntriesByDate(pool, year);
  const days = dayRows.map((row) => {
    const day = rowToDay(row);
    day.projectEntries = entriesByDate.get(day.date) || [];
    return day;
  });
  return {
    schemaVersion: 1,
    year,
    about: YEAR_ABOUT,
    days,
  };
}

async function fetchDay(conn, date) {
  const [rows] = await conn.query(
    `SELECT date, year, month, month_name, day, weekday,
            is_holiday, holiday_reason, holiday_title, daily_update,
            time_spend, client_id
     FROM calendar_days
     WHERE date = ?
     LIMIT 1`,
    [date],
  );
  return rows[0] ? rowToDay(rows[0]) : null;
}

async function fetchEntries(conn, date) {
  const [rows] = await conn.query(
    `SELECT entry_id, date, project_id, client_id, hours, task_description
     FROM project_entries
     WHERE date = ?
     ORDER BY entry_id`,
    [date],
  );
  return rows.map(rowToEntry);
}

async function persistDay(conn, date, day) {
  await conn.query(
    `UPDATE calendar_days
     SET is_holiday = ?, holiday_reason = ?, holiday_title = ?,
         daily_update = ?, time_spend = ?, client_id = ?
     WHERE date = ?`,
    [
      day.isHoliday ? 1 : 0,
      day.holidayReason,
      day.holidayTitle || null,
      day.dailyUpdate || "",
      normalizeTimeSpend(day.timeSpend),
      day.clientId || null,
      date,
    ],
  );
}

async function replaceEntries(conn, date, entries) {
  await conn.query("DELETE FROM project_entries WHERE date = ?", [date]);
  if (!entries.length) return;
  const values = entries.map((e) => [
    e.entryId,
    date,
    e.projectId,
    e.clientId || null,
    e.hours,
    e.taskDescription || "",
  ]);
  await conn.query(
    `INSERT INTO project_entries (
      entry_id, date, project_id, client_id, hours, task_description
    ) VALUES ?`,
    [values],
  );
}

/**
 * @param {number} year
 * @param {string} date ISO YYYY-MM-DD
 * @param {{ dailyUpdate?: string, dayType?: string, timeSpend?: string }} patch
 */
async function updateDay(year, date, patch) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const e = new Error("Invalid date format; use YYYY-MM-DD");
    e.statusCode = 400;
    throw e;
  }
  if (!date.startsWith(String(year))) {
    const e = new Error("Date does not match requested year");
    e.statusCode = 400;
    throw e;
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const day = await fetchDay(conn, date);
    if (!day) {
      const e = new Error("Date not found in calendar");
      e.statusCode = 404;
      throw e;
    }

    if (patch.dailyUpdate !== undefined) {
      if (typeof patch.dailyUpdate !== "string") {
        const e = new Error("dailyUpdate must be a string");
        e.statusCode = 400;
        throw e;
      }
      if (patch.dailyUpdate.length > MAX_DAILY_UPDATE_LENGTH) {
        const e = new Error(
          `dailyUpdate exceeds ${MAX_DAILY_UPDATE_LENGTH} characters`,
        );
        e.statusCode = 400;
        throw e;
      }
      day.dailyUpdate = patch.dailyUpdate;
    }

    if (patch.dayType !== undefined) {
      if (typeof patch.dayType !== "string" || !DAY_TYPES.has(patch.dayType)) {
        const e = new Error(
          "dayType must be one of: working, weekend, holiday, leave",
        );
        e.statusCode = 400;
        throw e;
      }
      Object.assign(day, applyDayType(patch.dayType));
      if (
        (patch.dayType === "holiday" || patch.dayType === "leave") &&
        patch.timeSpend === undefined
      ) {
        day.timeSpend = DEFAULT_TIME_SPEND;
      }
    }

    if (patch.timeSpend !== undefined) {
      const hours = normalizeTimeSpend(patch.timeSpend);
      if (!TIME_SPEND_OPTIONS.has(hours)) {
        const e = new Error("timeSpend must be an integer hour value from 0 to 12");
        e.statusCode = 400;
        throw e;
      }
      day.timeSpend = hours;
    }

    let projectEntries;
    if (patch.projectEntries !== undefined) {
      projectEntries = normalizeProjectEntries(patch.projectEntries);
      await replaceEntries(conn, date, projectEntries);
    } else {
      projectEntries = await fetchEntries(conn, date);
    }

    if (patch.clientId !== undefined) {
      if (patch.clientId === null || patch.clientId === "") {
        delete day.clientId;
      } else if (
        typeof patch.clientId === "string" &&
        UUID_RE.test(patch.clientId.trim())
      ) {
        day.clientId = patch.clientId.trim();
      } else {
        const e = new Error("clientId must be a valid UUID or null");
        e.statusCode = 400;
        throw e;
      }
    }

    await persistDay(conn, date, day);
    await conn.commit();
    return {
      ...day,
      dayType: inferDayType(day),
      timeSpend: normalizeTimeSpend(day.timeSpend),
      projectEntries,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function restoreDayType(day) {
  const weekday =
    typeof day.weekday === "string" ? day.weekday.trim().toLowerCase() : "";
  if (weekday === "saturday" || weekday === "sunday") {
    return "weekend";
  }
  const dt = new Date(
    Number(day.date.slice(0, 4)),
    Number(day.date.slice(5, 7)) - 1,
    Number(day.date.slice(8, 10)),
  );
  const dow = dt.getDay();
  return dow === 0 || dow === 6 ? "weekend" : "working";
}

/**
 * @param {Array<{ date?: string, title?: string, isOptional?: boolean }>} holidays
 * @param {{ includeOptional?: boolean, removeDates?: string[] }} [options]
 */
async function syncHolidays(holidays, options = {}) {
  const includeOptional = Boolean(options.includeOptional);
  if (!Array.isArray(holidays)) {
    const e = new Error("holidays must be an array");
    e.statusCode = 400;
    throw e;
  }

  const byYear = new Map();
  for (const item of holidays) {
    if (!item || typeof item !== "object") continue;
    if (!includeOptional && item.isOptional === true) continue;
    const date =
      typeof item.date === "string" ? item.date.trim().slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const year = parseInt(date.slice(0, 4), 10);
    const title =
      typeof item.title === "string" && item.title.trim()
        ? item.title.trim()
        : "Public holiday";
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push({ date, title });
  }

  const removeByYear = new Map();
  const removeDates = Array.isArray(options.removeDates)
    ? options.removeDates
    : [];
  for (const raw of removeDates) {
    const date = typeof raw === "string" ? raw.trim().slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const year = parseInt(date.slice(0, 4), 10);
    if (!removeByYear.has(year)) removeByYear.set(year, []);
    removeByYear.get(year).push(date);
  }

  const yearsToTouch = new Set([...byYear.keys(), ...removeByYear.keys()]);
  const summary = {
    yearsTouched: [],
    updated: 0,
    removed: 0,
    skippedLeave: 0,
    skippedMissing: 0,
    skippedNoYearFile: 0,
    titles: [],
    removedTitles: [],
  };

  const pool = getPool();

  for (const year of yearsToTouch) {
    await ensureYearIfAllowed(pool, year);
    const [countRows] = await pool.query(
      "SELECT COUNT(*) AS n FROM calendar_days WHERE year = ?",
      [year],
    );
    if (!(Number(countRows[0].n) > 0)) {
      const addCount = byYear.get(year)?.length || 0;
      const remCount = removeByYear.get(year)?.length || 0;
      summary.skippedNoYearFile += addCount + remCount;
      continue;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const keepDates = new Set((byYear.get(year) || []).map((i) => i.date));
      let touched = false;

      for (const { date, title } of byYear.get(year) || []) {
        const day = await fetchDay(conn, date);
        if (!day) {
          summary.skippedMissing += 1;
          continue;
        }
        const currentType = inferDayType(day);
        if (currentType === "leave") {
          summary.skippedLeave += 1;
          continue;
        }
        Object.assign(day, applyDayType("holiday"));
        day.holidayTitle = title;
        day.timeSpend = DEFAULT_TIME_SPEND;
        await persistDay(conn, date, day);
        touched = true;
        summary.updated += 1;
        summary.titles.push({ date, title });
      }

      for (const date of removeByYear.get(year) || []) {
        if (keepDates.has(date)) continue;
        const day = await fetchDay(conn, date);
        if (!day) {
          summary.skippedMissing += 1;
          continue;
        }
        const currentType = inferDayType(day);
        if (currentType !== "holiday") continue;
        const previousTitle =
          typeof day.holidayTitle === "string" && day.holidayTitle.trim()
            ? day.holidayTitle.trim()
            : "Public holiday";
        const nextType = restoreDayType(day);
        Object.assign(day, applyDayType(nextType));
        day.timeSpend = DEFAULT_TIME_SPEND;
        await persistDay(conn, date, day);
        touched = true;
        summary.removed += 1;
        summary.removedTitles.push({
          date,
          title: previousTitle,
          dayType: nextType,
        });
      }

      await conn.commit();
      if (touched) summary.yearsTouched.push(year);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  return summary;
}

module.exports = {
  listYears,
  getYearDocument,
  updateDay,
  syncHolidays,
  inferDayType,
  normalizeTimeSpend,
  MAX_DAILY_UPDATE_LENGTH,
  DEFAULT_TIME_SPEND,
  TIME_SPEND_OPTIONS,
};
