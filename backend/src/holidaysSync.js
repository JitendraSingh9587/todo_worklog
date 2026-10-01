const DEFAULT_HOLIDAYS_URL = "https://worklog.kadellabs.com/api/holidays";

/**
 * Fetch holidays from Worklog API.
 * Auth priority: request overrides → env HOLIDAYS_API_TOKEN / HOLIDAYS_API_COOKIE.
 * @param {{ token?: string, cookie?: string }} [auth]
 * @returns {Promise<{ holidays: Array<object>, meta: object }>}
 */
async function fetchRemoteHolidays(auth = {}) {
  const url = process.env.HOLIDAYS_API_URL || DEFAULT_HOLIDAYS_URL;
  const headers = {
    Accept: "application/json",
  };

  const token =
    (auth.token && String(auth.token).trim()) ||
    (process.env.HOLIDAYS_API_TOKEN &&
      String(process.env.HOLIDAYS_API_TOKEN).trim()) ||
    "";
  const cookie =
    (auth.cookie && String(auth.cookie).trim()) ||
    (process.env.HOLIDAYS_API_COOKIE &&
      String(process.env.HOLIDAYS_API_COOKIE).trim()) ||
    "";

  if (token) {
    headers.Authorization = token.toLowerCase().startsWith("bearer ")
      ? token
      : `Bearer ${token}`;
  }
  if (cookie) {
    headers.Cookie = cookie;
  }

  let response;
  try {
    response = await fetch(url, { method: "GET", headers });
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
    let msg =
      (body && (body.error || body.message)) ||
      `Holidays API HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      msg =
        "Worklog session required. Your login on worklog.kadellabs.com is not shared with this app — paste your session Cookie from DevTools (Network → /api/holidays → Request Headers → Cookie).";
    }
    const e = new Error(msg);
    e.statusCode =
      response.status === 401 || response.status === 403 ? 401 : 502;
    throw e;
  }

  if (!body || body.success !== true || !Array.isArray(body.data)) {
    const e = new Error("Holidays API response missing success/data");
    e.statusCode = 502;
    throw e;
  }

  return {
    holidays: body.data,
    meta: {
      source: body.source || null,
      count: body.count,
      requestId: body.requestId || null,
      url,
      usedCookie: Boolean(cookie),
      usedToken: Boolean(token),
    },
  };
}

module.exports = {
  DEFAULT_HOLIDAYS_URL,
  fetchRemoteHolidays,
};
