import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../common/Button.jsx";
import { calendarApi } from "../../api/client.js";
import { MONTH_NAMES } from "../../constants/months.js";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Parse YYYY-MM-DD as local calendar date (avoid UTC shift).
 * @param {string} dateStr
 * @returns {Date|null}
 */
function parseLocalDate(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return null;
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * @param {string} dateStr
 * @returns {string}
 */
function weekdayLabel(dateStr) {
  const dt = parseLocalDate(dateStr);
  if (!dt) return "";
  return WEEKDAY_NAMES[dt.getDay()] || "";
}

/**
 * @param {string} dateStr
 * @returns {string} e.g. "15 Jan"
 */
function shortDateLabel(dateStr) {
  const dt = parseLocalDate(dateStr);
  if (!dt) return dateStr;
  const day = String(dt.getDate()).padStart(2, "0");
  const mon = MONTH_NAMES[dt.getMonth()]?.slice(0, 3) || "";
  return `${day} ${mon}`;
}

/**
 * Group holidays by month index (0–11).
 * @param {Array<{ date: string }>} holidays
 * @returns {Array<{ monthIndex: number, label: string, items: Array }>}`
 */
function groupByMonth(holidays) {
  /** @type {Map<number, Array>} */
  const map = new Map();
  for (const h of holidays) {
    const dt = parseLocalDate(h.date);
    if (!dt) continue;
    const mi = dt.getMonth();
    if (!map.has(mi)) map.set(mi, []);
    map.get(mi).push(h);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([monthIndex, items]) => ({
      monthIndex,
      label: MONTH_NAMES[monthIndex] || `Month ${monthIndex + 1}`,
      items,
    }));
}

/**
 * Dialog: fetch India holidays → select → confirm → import.
 * @param {{ open: boolean, year: number, onClose: () => void, onImported: (result: object) => void, onStatus?: (msg: string, kind?: string) => void }} props
 */
export default function HolidayImportDialog({
  open,
  year,
  onClose,
  onImported,
  onStatus,
}) {
  const dialogRef = useRef(null);
  const [step, setStep] = useState("list"); // list | confirm
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [holidays, setHolidays] = useState([]);
  const [meta, setMeta] = useState(null);
  /** @type {[Set<string>, function]} */
  const [selected, setSelected] = useState(() => new Set());

  const holidayKey = useCallback((h) => `${h.date}|${h.title}`, []);

  const loadHolidays = useCallback(async () => {
    setLoading(true);
    setError("");
    setStep("list");
    try {
      const result = await calendarApi.previewHolidays({ year });
      const list = Array.isArray(result.holidays) ? result.holidays : [];
      setHolidays(list);
      setMeta(result.meta || null);
      // Pre-select gazetted (non-restricted) holidays by default
      setSelected(
        new Set(
          list.filter((h) => !h.isOptional).map((h) => holidayKey(h)),
        ),
      );
    } catch (e) {
      setHolidays([]);
      setMeta(null);
      setSelected(new Set());
      setError(e.message || "Failed to load holidays");
    } finally {
      setLoading(false);
    }
  }, [year, holidayKey]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      loadHolidays();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, loadHolidays]);

  const selectedHolidays = useMemo(
    () => holidays.filter((h) => selected.has(holidayKey(h))),
    [holidays, selected, holidayKey],
  );

  const monthGroups = useMemo(() => groupByMonth(holidays), [holidays]);

  const confirmMonthGroups = useMemo(
    () => groupByMonth(selectedHolidays),
    [selectedHolidays],
  );

  function toggleOne(h) {
    const key = holidayKey(h);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(holidays.map((h) => holidayKey(h))));
  }

  function selectNone() {
    setSelected(new Set());
  }

  function selectGazettedOnly() {
    setSelected(
      new Set(holidays.filter((h) => !h.isOptional).map((h) => holidayKey(h))),
    );
  }

  function handleGoConfirm() {
    if (selectedHolidays.length === 0) {
      setError("Select at least one holiday to import.");
      return;
    }
    setError("");
    setStep("confirm");
  }

  async function handleConfirmImport() {
    if (selectedHolidays.length === 0) return;
    setImporting(true);
    setError("");
    onStatus?.(`Importing ${selectedHolidays.length} holiday(s)…`, "");
    try {
      const payload = selectedHolidays.map((h) => ({
        date: h.date,
        title: h.title,
        isOptional: Boolean(h.isOptional),
      }));
      const result = await calendarApi.syncHolidays({
        holidays: payload,
        includeOptional: true,
      });
      onImported?.(result);
      onClose?.();
    } catch (e) {
      setError(e.message || "Import failed");
      onStatus?.(e.message, "err");
    } finally {
      setImporting(false);
    }
  }

  function handleClose() {
    if (importing) return;
    onClose?.();
  }

  const regionLabel = meta?.region || "—";

  return (
    <dialog
      ref={dialogRef}
      className="holiday-import-dialog"
      onClose={handleClose}
      onCancel={(ev) => {
        if (importing) {
          ev.preventDefault();
          return;
        }
        handleClose();
      }}
    >
      <div className="holiday-import-dialog__body">
        <h2 className="holiday-import-dialog__title">
          {step === "confirm" ? "Confirm import" : "Import public holidays"}
        </h2>

        {step === "list" && (
          <>
            <p className="holiday-import-dialog__copy">
              Holidays for <strong>{year}</strong>
              {meta?.country ? ` · ${meta.country}` : ""}
              {regionLabel !== "—" ? ` · region ${regionLabel}` : ""}. Select
              the ones you want to mark on your calendar.
            </p>

            <div className="holiday-import-dialog__toolbar">
              <Button
                type="button"
                size="sm"
                onClick={selectAll}
                disabled={loading || !holidays.length}
              >
                Select all
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={selectGazettedOnly}
                disabled={loading || !holidays.length}
              >
                Gazetted only
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={selectNone}
                disabled={loading || !holidays.length}
              >
                Clear
              </Button>
              <span className="holiday-import-dialog__count">
                {selected.size} / {holidays.length} selected
              </span>
            </div>

            {loading && (
              <p className="holiday-import-dialog__hint">Loading holidays…</p>
            )}

            {!loading && holidays.length > 0 && (
              <div
                className="holiday-import-list"
                role="listbox"
                aria-label="Holidays by month"
              >
                {monthGroups.map((group) => (
                  <section
                    key={group.monthIndex}
                    className="holiday-import-month"
                    aria-label={`${group.label} ${year}`}
                  >
                    <h3 className="holiday-import-month__title">
                      {group.label} {year}
                      <span className="holiday-import-month__count">
                        {group.items.length}
                      </span>
                    </h3>
                    <ul className="holiday-import-month__list">
                      {group.items.map((h) => {
                        const key = holidayKey(h);
                        const checked = selected.has(key);
                        return (
                          <li key={key} className="holiday-import-list__item">
                            <label className="holiday-import-list__label">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleOne(h)}
                              />
                              <span className="holiday-import-list__date">
                                {shortDateLabel(h.date)}
                              </span>
                              <span className="holiday-import-list__weekday">
                                {weekdayLabel(h.date)}
                              </span>
                              <span className="holiday-import-list__name">
                                {h.title}
                              </span>
                              {h.isOptional && (
                                <span className="holiday-import-list__badge">
                                  restricted
                                </span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            {!loading && !error && holidays.length === 0 && (
              <p className="holiday-import-dialog__hint">
                No holidays returned for this year.
              </p>
            )}
          </>
        )}

        {step === "confirm" && (
          <>
            <p className="holiday-import-dialog__copy holiday-import-dialog__copy--confirm">
              You are importing these holidays into your calendar:
            </p>
            <div className="holiday-import-confirm-list">
              {confirmMonthGroups.map((group) => (
                <section key={group.monthIndex} className="holiday-import-month">
                  <h3 className="holiday-import-month__title">
                    {group.label} {year}
                  </h3>
                  <ul className="holiday-import-month__list">
                    {group.items.map((h) => (
                      <li key={holidayKey(h)} className="holiday-import-confirm-row">
                        <span className="holiday-import-list__date">
                          {shortDateLabel(h.date)}
                        </span>
                        <span className="holiday-import-list__weekday">
                          {weekdayLabel(h.date)}
                        </span>
                        <span className="holiday-import-list__name">{h.title}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <p className="holiday-import-dialog__hint">
              {selectedHolidays.length} holiday
              {selectedHolidays.length === 1 ? "" : "s"} will be marked on
              matching dates (leave days are left unchanged).
            </p>
          </>
        )}

        {error && (
          <p className="holiday-import-dialog__error" role="alert">
            {error}
          </p>
        )}

        <div className="holiday-import-dialog__actions">
          {step === "list" ? (
            <>
              <Button
                type="button"
                size="sm"
                onClick={handleClose}
                disabled={importing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleGoConfirm}
                disabled={loading || selected.size === 0}
              >
                Import selected
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => setStep("list")}
                disabled={importing}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleConfirmImport}
                disabled={importing || selectedHolidays.length === 0}
              >
                {importing ? "Importing…" : "Confirm import"}
              </Button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
