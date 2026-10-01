/**
 * JSON fetch helper used by all API modules.
 * @param {string} url
 * @param {RequestInit} [options]
 */
export async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || "Request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

export const calendarApi = {
  listYears: () => fetchJson("/api/calendar/years"),
  getYear: (year) => fetchJson(`/api/calendar/${year}`),
  patchDay: (year, date, body) =>
    fetchJson(`/api/calendar/${year}/days/${date}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  syncHolidays: (body) =>
    fetchJson("/api/calendar/sync-holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }),
  reportPdfUrl: (year, month) =>
    `/api/calendar/${year}/months/${month}/report.pdf`,
};

export const todosApi = {
  list: () => fetchJson("/api/todos"),
  putDay: (date, todos) =>
    fetchJson(`/api/todos/${date}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todos }),
    }),
};

export const catalogApi = {
  get: () => fetchJson("/api/catalog"),
};
