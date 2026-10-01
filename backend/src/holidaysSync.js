const DEFAULT_HOLIDAYS_BASE_URL =
  "https://calendar-api-d7a8.onrender.com/v1/holidays";
const DEFAULT_COUNTRY = "IN";
const DEFAULT_REGION = "RJ";

/**
 * Build the remote holidays URL with query params.
 * @param {{ year?: number|string, country?: string, region?: string }} [query]
 * @returns {string}
 */
function buildHolidaysUrl(query = {}) {
  const base = process.env.HOLIDAYS_API_URL || DEFAULT_HOLIDAYS_BASE_URL;
  const url = new URL(base);
  const country =
    (query.country && String(query.country).trim()) ||
    (process.env.HOLIDAYS_COUNTRY &&
      String(process.env.HOLIDAYS_COUNTRY).trim()) ||
    DEFAULT_COUNTRY;
  const year =
    query.year !== undefined && query.year !== null && query.year !== ""
      ? String(query.year).trim()
      : String(new Date().getFullYear());
  const region =
    query.region !== undefined
      ? String(query.region).trim()
      : process.env.HOLIDAYS_REGION !== undefined
        ? String(process.env.HOLIDAYS_REGION).trim()
        : DEFAULT_REGION;

  url.searchParams.set("country", country);
  url.searchParams.set("year", year);
  if (region && region.toLowerCase() !== "central") {
    url.searchParams.set("region", region.toUpperCase());
  }
  return url.toString();
}

/**
 * Normalize calendar-api (or legacy) holiday items to store shape.
 * @param {object} item
 * @returns {{ date: string, title: string, isOptional: boolean, type: string|null, description: string|null }|null}
 */
function normalizeHoliday(item) {
  if (!item || typeof item !== "object") return null;
  const date =
    typeof item.date === "string" ? item.date.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const titleRaw =
    (typeof item.name === "string" && item.name.trim()) ||
    (typeof item.title === "string" && item.title.trim()) ||
    "";
  const type =
    typeof item.type === "string" && item.type.trim()
      ? item.type.trim()
      : null;
  const isOptional =
    item.isOptional === true || type === "restricted_holiday";

  return {
    date,
    title: titleRaw || "Public holiday",
    isOptional,
    type,
    description:
      typeof item.description === "string" && item.description.trim()
        ? item.description.trim()
        : null,
  };
}

/**
 * Fetch public holidays from the India calendar API (no auth).
 * @param {{ year?: number|string, country?: string, region?: string }} [query]
 * @returns {Promise<{ holidays: Array<object>, meta: object }>}
 */
async function fetchRemoteHolidays(query = {}) {
  const url = buildHolidaysUrl(query);
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    const e = new Error(`Failed to reach holidays API: ${err.message}`);
    e.statusCode = 502;
    throw e;
  }

  let body;
  try {
    body = await response.json();
  } catch {
    const e = new Error("Holidays API returned non-JSON response");
    e.statusCode = 502;
    throw e;
  }

  if (!response.ok) {
    const msg =
      (body && (body.error || body.message)) ||
      `Holidays API HTTP ${response.status}`;
    const e = new Error(msg);
    e.statusCode = 502;
    throw e;
  }

  if (!body || !Array.isArray(body.data)) {
    const e = new Error("Holidays API response missing data array");
    e.statusCode = 502;
    throw e;
  }

  const holidays = body.data
    .map(normalizeHoliday)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    holidays,
    meta: {
      source: "calendar-api",
      country: body.country || null,
      year: body.year || null,
      region: body.region || null,
      count: holidays.length,
      totalResults: body.meta?.totalResults ?? holidays.length,
      url,
    },
  };
}

module.exports = {
  DEFAULT_HOLIDAYS_BASE_URL,
  DEFAULT_COUNTRY,
  DEFAULT_REGION,
  buildHolidaysUrl,
  normalizeHoliday,
  fetchRemoteHolidays,
};
