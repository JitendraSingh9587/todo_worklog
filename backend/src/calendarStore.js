const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = process.env.CALENDAR_DATA_DIR
  ? path.resolve(process.env.CALENDAR_DATA_DIR)
  : path.join(__dirname, "..", "data");

const MAX_DAILY_UPDATE_LENGTH = 50_000;

const DAY_TYPES = new Set(["working", "weekend", "holiday", "leave"]);

const TIME_SPEND_OPTIONS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

const DEFAULT_TIME_SPEND = 8;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
 * Normalize API / UI time spend to integer hours 0–12 (matches workingHours).
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

let writeChain = Promise.resolve();

/**
 * @param {() => Promise<void>} fn
 */
function serializeWrite(fn) {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => {});
  return next;
}

function yearFilePath(year) {
  return path.join(DATA_DIR, `year-${year}.json`);
}

/**
 * @param {number} year
 */
async function listYears() {
  let names;
  try {
    names = await fs.readdir(DATA_DIR);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  return names
    .filter((f) => /^year-\d{4}\.json$/.test(f))
    .map((f) => parseInt(f.slice(5, 9), 10))
    .filter((y) => !Number.isNaN(y))
    .sort((a, b) => a - b);
}

/**
 * @param {number} year
 */
async function getYearDocument(year) {
  const filePath = yearFilePath(year);
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      const e = new Error(`No calendar data for year ${year}`);
      e.statusCode = 404;
      throw e;
    }
    throw err;
  }
  const doc = JSON.parse(raw);
  if (doc.year !== year) {
    const e = new Error("Calendar file year mismatch");
    e.statusCode = 500;
    throw e;
  }
  return doc;
}

/**
 * @param {number} year
 * @param {object} doc
 */
async function writeYearDocument(year, doc) {
  const filePath = yearFilePath(year);
  const tmp = `${filePath}.${process.pid}.tmp`;
  const content = `${JSON.stringify(doc, null, 2)}\n`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, filePath);
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

  return serializeWrite(async () => {
    const doc = await getYearDocument(year);
    const idx = doc.days.findIndex((d) => d.date === date);
    if (idx === -1) {
      const e = new Error("Date not found in calendar");
      e.statusCode = 404;
      throw e;
    }
    const day = doc.days[idx];

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
      // Public holidays and leave default to a full day (8hr) unless timeSpend is also patched.
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

    if (patch.projectEntries !== undefined) {
      day.projectEntries = normalizeProjectEntries(patch.projectEntries);
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

    await writeYearDocument(year, doc);
    return {
      ...day,
      dayType: inferDayType(day),
      timeSpend: normalizeTimeSpend(day.timeSpend),
      projectEntries: Array.isArray(day.projectEntries)
        ? day.projectEntries
        : [],
    };
  });
}

/**
 * Apply remote holiday list to local year calendars.
 * Sets matching dates to public holiday (skips leave days).
 * @param {Array<{ date?: string, title?: string, isOptional?: boolean }>} holidays
 * @param {{ includeOptional?: boolean }} [options]
 */
async function syncHolidays(holidays, options = {}) {
  const includeOptional = Boolean(options.includeOptional);
  if (!Array.isArray(holidays)) {
    const e = new Error("holidays must be an array");
    e.statusCode = 400;
    throw e;
  }

  /** @type {Map<number, Array<{ date: string, title: string }>>} */
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

  const available = await listYears();
  const summary = {
    yearsTouched: [],
    updated: 0,
    skippedLeave: 0,
    skippedMissing: 0,
    skippedNoYearFile: 0,
    titles: [],
  };

  for (const [year, items] of byYear) {
    if (!available.includes(year)) {
      summary.skippedNoYearFile += items.length;
      continue;
    }

    await serializeWrite(async () => {
      const doc = await getYearDocument(year);
      const indexByDate = new Map(doc.days.map((d, i) => [d.date, i]));
      let touched = false;

      for (const { date, title } of items) {
        const idx = indexByDate.get(date);
        if (idx === undefined) {
          summary.skippedMissing += 1;
          continue;
        }
        const day = doc.days[idx];
        const currentType = inferDayType(day);
        if (currentType === "leave") {
          summary.skippedLeave += 1;
          continue;
        }
        Object.assign(day, applyDayType("holiday"));
        day.holidayTitle = title;
        day.timeSpend = DEFAULT_TIME_SPEND;
        touched = true;
        summary.updated += 1;
        summary.titles.push({ date, title });
      }

      if (touched) {
        await writeYearDocument(year, doc);
        summary.yearsTouched.push(year);
      }
    });
  }

  return summary;
}

module.exports = {
  DATA_DIR,
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
