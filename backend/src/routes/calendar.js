const express = require("express");
const calendarStore = require("../calendarStore");
const { fetchRemoteHolidays } = require("../holidaysSync");
const {
  buildMonthlyReportPdf,
  daysInMonth,
} = require("../monthlyReportPdf");

const router = express.Router();

function parseYearMonth(req) {
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);
  if (Number.isNaN(year) || year < 1900 || year > 2100) {
    return { error: "Invalid year", status: 400 };
  }
  if (Number.isNaN(month) || month < 1 || month > 12) {
    return { error: "Invalid month (use 1–12)", status: 400 };
  }
  return { year, month };
}

function buildMonthRows(doc, year, month) {
  const dim = daysInMonth(year, month);
  const dayByDate = new Map(doc.days.map((d) => [d.date, d]));
  const rows = [];
  const counts = { working: 0, weekend: 0, holiday: 0, leave: 0 };

  for (let d = 1; d <= dim; d += 1) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const day = dayByDate.get(dateStr);
    if (!day) continue;
    const dayType = calendarStore.inferDayType(day);
    const text = (day.dailyUpdate || "").trim();
    counts[dayType] += 1;
    rows.push({ day, dayType, text, dateStr });
  }

  return { rows, counts };
}

router.get("/years", async (req, res, next) => {
  try {
    const years = await calendarStore.listYears();
    res.json({ years });
  } catch (err) {
    next(err);
  }
});

/**
 * Preview remote public holidays (India calendar API) without writing the calendar.
 * Query: year, country, region
 */
router.get("/holidays/preview", async (req, res, next) => {
  try {
    const yearRaw = req.query.year;
    const year =
      yearRaw !== undefined && yearRaw !== ""
        ? parseInt(String(yearRaw), 10)
        : new Date().getFullYear();
    if (Number.isNaN(year) || year < 1900 || year > 2100) {
      res.status(400).json({ error: "Invalid year" });
      return;
    }

    const remote = await fetchRemoteHolidays({
      year,
      country: typeof req.query.country === "string" ? req.query.country : "",
      region:
        req.query.region !== undefined
          ? String(req.query.region)
          : undefined,
    });

    res.json({
      ok: true,
      holidays: remote.holidays,
      meta: remote.meta,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 400 && status < 600) {
      res.status(status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

/**
 * Import selected holidays into local year calendars.
 * Body:
 * - holidays: [{ date, title, isOptional? }] — required selected list
 * - includeOptional: true — also apply optional/restricted items (default true when holidays provided)
 */
router.post("/sync-holidays", async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};

    if (!Array.isArray(body.holidays) || body.holidays.length === 0) {
      res.status(400).json({
        error: "Provide a non-empty holidays array to import",
      });
      return;
    }

    const holidays = body.holidays;
    const includeOptional =
      body.includeOptional === undefined
        ? true
        : Boolean(body.includeOptional);
    const meta = { source: "request body", count: holidays.length };

    const summary = await calendarStore.syncHolidays(holidays, {
      includeOptional,
    });
    res.json({
      ok: true,
      fetched: holidays.length,
      meta,
      ...summary,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 400 && status < 600) {
      res.status(status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.get("/:year/months/:month/report.pdf", async (req, res, next) => {
  try {
    const parsed = parseYearMonth(req);
    if (parsed.error) {
      res.status(parsed.status).json({ error: parsed.error });
      return;
    }
    const { year, month } = parsed;
    const doc = await calendarStore.getYearDocument(year);
    const { rows, counts } = buildMonthRows(doc, year, month);
    const pdf = await buildMonthlyReportPdf({ year, month, rows, counts });
    const filename = `timesheet-${year}-${String(month).padStart(2, "0")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(pdf.length));
    res.send(pdf);
  } catch (err) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.get("/:year", async (req, res, next) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (Number.isNaN(year) || year < 1900 || year > 2100) {
      res.status(400).json({ error: "Invalid year" });
      return;
    }
    const doc = await calendarStore.getYearDocument(year);
    const days = doc.days.map((d) => ({
      ...d,
      dayType: calendarStore.inferDayType(d),
      timeSpend: calendarStore.normalizeTimeSpend(d.timeSpend),
      projectEntries: Array.isArray(d.projectEntries) ? d.projectEntries : [],
    }));
    res.json({
      schemaVersion: doc.schemaVersion,
      year: doc.year,
      about: doc.about,
      days,
    });
  } catch (err) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.patch("/:year/days/:date", async (req, res, next) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (Number.isNaN(year) || year < 1900 || year > 2100) {
      res.status(400).json({ error: "Invalid year" });
      return;
    }
    const date = req.params.date;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const hasUpdate = Object.prototype.hasOwnProperty.call(body, "dailyUpdate");
    const hasType = Object.prototype.hasOwnProperty.call(body, "dayType");
    const hasTimeSpend = Object.prototype.hasOwnProperty.call(body, "timeSpend");
    const hasProjectEntries = Object.prototype.hasOwnProperty.call(
      body,
      "projectEntries",
    );
    const hasClientId = Object.prototype.hasOwnProperty.call(body, "clientId");
    if (
      !hasUpdate &&
      !hasType &&
      !hasTimeSpend &&
      !hasProjectEntries &&
      !hasClientId
    ) {
      res.status(400).json({
        error:
          "Provide dailyUpdate, dayType, timeSpend, projectEntries, and/or clientId",
      });
      return;
    }
    const patch = {};
    if (hasUpdate) patch.dailyUpdate = body.dailyUpdate;
    if (hasType) patch.dayType = body.dayType;
    if (hasTimeSpend) patch.timeSpend = body.timeSpend;
    if (hasProjectEntries) patch.projectEntries = body.projectEntries;
    if (hasClientId) patch.clientId = body.clientId;

    const day = await calendarStore.updateDay(year, date, patch);
    res.json(day);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 400 && status < 500) {
      res.status(status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

module.exports = router;
