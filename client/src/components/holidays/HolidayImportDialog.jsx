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
 * @param {string} dateStr
 * @param {string} [weekday]
 * @returns {"weekend"|"working"}
 */
function restoreDayType(dateStr, weekday) {
  const w = typeof weekday === "string" ? weekday.trim().toLowerCase() : "";
  if (w === "saturday" || w === "sunday") return "weekend";
  const dt = parseLocalDate(dateStr);
  if (!dt) return "working";
  const dow = dt.getDay();
  return dow === 0 || dow === 6 ? "weekend" : "working";
}

/**
 * Group holidays by month index (0–11).
 * @param {Array<{ date: string }>} holidays
 * @returns {Array<{ monthIndex: number, label: string, items: Array }>}
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
 * @param {"weekend"|"working"|"holiday"} dayType
 */
function dayTypeLabel(dayType) {
  if (dayType === "weekend") return "Weekend";
  if (dayType === "holiday") return "Public holiday";
  return "Working day";
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
  const listRef = useRef(null);
  /** @type {React.MutableRefObject<Map<number, HTMLElement|null>>} */
  const monthRefs = useRef(new Map());
  const [step, setStep] = useState("list"); // list | confirm
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [holidays, setHolidays] = useState([]);
  const [meta, setMeta] = useState(null);
  /** Existing public holidays on the calendar for this year */
  const [existingHolidays, setExistingHolidays] = useState([]);
  /** date -> dayType for the loaded year */
  const [dayTypeByDate, setDayTypeByDate] = useState(() => new Map());
  /** Dates the user chose to keep as public holiday (skip removal) */
  const [keptDates, setKeptDates] = useState(() => new Set());
  /** @type {[Set<string>, function]} */
  const [selected, setSelected] = useState(() => new Set());
  const [filterQuery, setFilterQuery] = useState("");
  const [jumpMonth, setJumpMonth] = useState(null);

  const holidayKey = useCallback((h) => `${h.date}|${h.title}`, []);

  const loadHolidays = useCallback(async () => {
    setLoading(true);
    setError("");
    setStep("list");
    setKeptDates(new Set());
    setFilterQuery("");
    setJumpMonth(null);
    try {
      const [result, yearDoc] = await Promise.all([
        calendarApi.previewHolidays({ year }),
        calendarApi.getYear(year).catch(() => ({ days: [] })),
      ]);
      const list = Array.isArray(result.holidays) ? result.holidays : [];
      setHolidays(list);
      setMeta(result.meta || null);

      const typeMap = new Map();
      const existing = [];
      for (const d of yearDoc.days || []) {
        if (!d?.date) continue;
        const dayType = d.dayType || "working";
        typeMap.set(d.date, dayType);
        if (dayType === "holiday") {
          existing.push({
            date: d.date,
            title:
              typeof d.holidayTitle === "string" && d.holidayTitle.trim()
                ? d.holidayTitle.trim()
                : "Public holiday",
            weekday: d.weekday || weekdayLabel(d.date),
          });
        }
      }
      setDayTypeByDate(typeMap);
      setExistingHolidays(existing);

      // Default selection = what's already on the calendar (no surprise adds/removes).
      // Existing holidays not found in the API list are auto-kept.
      const existingDates = new Set(existing.map((e) => e.date));
      const initialSelected = new Set();
      const matchedExistingDates = new Set();
      const byDate = new Map();
      for (const h of list) {
        if (!byDate.has(h.date)) byDate.set(h.date, []);
        byDate.get(h.date).push(h);
      }
      for (const ex of existing) {
        const candidates = byDate.get(ex.date) || [];
        if (!candidates.length) continue;
        matchedExistingDates.add(ex.date);
        const titleLc = ex.title.toLowerCase();
        const titleMatch = candidates.find(
          (h) => h.title.toLowerCase() === titleLc,
        );
        const pick =
          titleMatch ||
          candidates.find((h) => !h.isOptional) ||
          candidates[0];
        if (pick) initialSelected.add(holidayKey(pick));
      }
      const autoKept = new Set(
        [...existingDates].filter((d) => !matchedExistingDates.has(d)),
      );
      setKeptDates(autoKept);
      setSelected(initialSelected);
    } catch (e) {
      setHolidays([]);
      setMeta(null);
      setExistingHolidays([]);
      setDayTypeByDate(new Map());
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

  const selectedDates = useMemo(
    () => new Set(selectedHolidays.map((h) => h.date)),
    [selectedHolidays],
  );

  /**
   * Truly new: selected dates that are currently working days.
   * Weekends / existing public holidays / leave are not listed as "new".
   */
  const newSelectedHolidays = useMemo(() => {
    const seen = new Set();
    const items = [];
    for (const h of selectedHolidays) {
      if (seen.has(h.date)) continue;
      const current = dayTypeByDate.get(h.date) || "working";
      if (current !== "working") continue;
      seen.add(h.date);
      items.push(h);
    }
    return items;
  }, [selectedHolidays, dayTypeByDate]);

  /** Selected dates already public holidays on the calendar */
  const alreadyOnCalendar = useMemo(() => {
    const seen = new Set();
    const items = [];
    for (const h of selectedHolidays) {
      if (seen.has(h.date)) continue;
      if ((dayTypeByDate.get(h.date) || "working") !== "holiday") continue;
      seen.add(h.date);
      items.push(h);
    }
    return items;
  }, [selectedHolidays, dayTypeByDate]);

  /** Selected dates that fall on weekend (already non-working) */
  const weekendSelected = useMemo(() => {
    const seen = new Set();
    const items = [];
    for (const h of selectedHolidays) {
      if (seen.has(h.date)) continue;
      if ((dayTypeByDate.get(h.date) || "working") !== "weekend") continue;
      seen.add(h.date);
      items.push(h);
    }
    return items;
  }, [selectedHolidays, dayTypeByDate]);

  /** Existing public holidays whose dates are not in the import selection and not kept */
  const removedHolidays = useMemo(
    () =>
      existingHolidays
        .filter((h) => !selectedDates.has(h.date) && !keptDates.has(h.date))
        .map((h) => ({
          ...h,
          restoreTo: restoreDayType(h.date, h.weekday),
        })),
    [existingHolidays, selectedDates, keptDates],
  );

  const keptHolidays = useMemo(
    () =>
      existingHolidays.filter(
        (h) => keptDates.has(h.date) && !selectedDates.has(h.date),
      ),
    [existingHolidays, keptDates, selectedDates],
  );

  const monthGroups = useMemo(() => groupByMonth(holidays), [holidays]);

  const filteredMonthGroups = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return monthGroups;
    return monthGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((h) => {
          const title = (h.title || "").toLowerCase();
          const date = h.date || "";
          const weekday = weekdayLabel(h.date).toLowerCase();
          const month = group.label.toLowerCase();
          return (
            title.includes(q) ||
            date.includes(q) ||
            weekday.includes(q) ||
            month.includes(q) ||
            shortDateLabel(h.date).toLowerCase().includes(q)
          );
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [monthGroups, filterQuery]);

  const availableMonthIndexes = useMemo(
    () => new Set(monthGroups.map((g) => g.monthIndex)),
    [monthGroups],
  );

  function jumpToMonth(monthIndex) {
    setJumpMonth(monthIndex);
    setFilterQuery("");
  }

  useEffect(() => {
    if (jumpMonth == null || step !== "list") return;
    if (filterQuery.trim()) return;
    const el = monthRefs.current.get(jumpMonth);
    const list = listRef.current;
    if (!el || !list) return;
    const top = el.offsetTop;
    list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [jumpMonth, filterQuery, step, filteredMonthGroups]);

  const confirmAddGroups = useMemo(
    () => groupByMonth(newSelectedHolidays),
    [newSelectedHolidays],
  );

  const confirmRemoveGroups = useMemo(
    () => groupByMonth(removedHolidays),
    [removedHolidays],
  );

  const confirmKeptGroups = useMemo(
    () => groupByMonth(keptHolidays),
    [keptHolidays],
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

  function keepExistingHoliday(date) {
    setKeptDates((prev) => {
      const next = new Set(prev);
      next.add(date);
      return next;
    });
  }

  function undoKeepExistingHoliday(date) {
    setKeptDates((prev) => {
      const next = new Set(prev);
      next.delete(date);
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
    // Selection matching the calendar → confirm shows empty diffs (no-op).
    // Empty selection with existing holidays → confirm shows removals.
    if (selectedHolidays.length === 0 && existingHolidays.length === 0) {
      setError("Select at least one holiday to import.");
      return;
    }
    setError("");
    setStep("confirm");
  }

  async function handleConfirmImport() {
    const hasAdds = selectedHolidays.length > 0 || keptHolidays.length > 0;
    const hasRemoves = removedHolidays.length > 0;
    if (!hasAdds && !hasRemoves) {
      onStatus?.("No holiday changes to apply.", "ok");
      onClose?.();
      return;
    }

    setImporting(true);
    setError("");
    onStatus?.(
      `Applying holiday changes` +
        (newSelectedHolidays.length
          ? `: ${newSelectedHolidays.length} new`
          : "") +
        (removedHolidays.length
          ? `, ${removedHolidays.length} removed`
          : "") +
        "…",
      "",
    );
    try {
      const payload = selectedHolidays.map((h) => ({
        date: h.date,
        title: h.title,
        isOptional: Boolean(h.isOptional),
      }));
      for (const h of keptHolidays) {
        if (!payload.some((p) => p.date === h.date)) {
          payload.push({
            date: h.date,
            title: h.title,
            isOptional: false,
          });
        }
      }
      // Keep already-on-calendar selected dates in payload even if somehow missing
      for (const h of alreadyOnCalendar) {
        if (!payload.some((p) => p.date === h.date)) {
          payload.push({
            date: h.date,
            title: h.title,
            isOptional: false,
          });
        }
      }

      const result = await calendarApi.syncHolidays({
        holidays: payload,
        includeOptional: true,
        removeDates: removedHolidays.map((h) => h.date),
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
              {regionLabel !== "—" ? ` · region ${regionLabel}` : ""}. Checkboxes
              start matching your calendar. Check more to add, or uncheck to
              remove. Use <strong>Gazetted only</strong> /{" "}
              <strong>Select all</strong> to expand the selection.
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
                {existingHolidays.length
                  ? ` · ${existingHolidays.length} on calendar`
                  : ""}
              </span>
            </div>

            {!loading && holidays.length > 0 && (
              <div className="holiday-import-filters">
                <label className="holiday-import-search">
                  <span className="sr-only">Filter holidays</span>
                  <input
                    type="search"
                    value={filterQuery}
                    onChange={(e) => {
                      setFilterQuery(e.target.value);
                      setJumpMonth(null);
                    }}
                    placeholder="Filter by name, date, or month…"
                    autoComplete="off"
                  />
                </label>
                <div
                  className="holiday-import-month-jump"
                  role="toolbar"
                  aria-label="Jump to month"
                >
                  {MONTH_NAMES.map((name, index) => {
                    const available = availableMonthIndexes.has(index);
                    const active = jumpMonth === index;
                    return (
                      <button
                        key={name}
                        type="button"
                        className={[
                          "holiday-import-month-jump__btn",
                          active ? "is-active" : "",
                          !available ? "is-disabled" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={!available || loading}
                        onClick={() => jumpToMonth(index)}
                        title={
                          available
                            ? `Jump to ${name}`
                            : `No holidays in ${name}`
                        }
                      >
                        {name.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {loading && (
              <p className="holiday-import-dialog__hint">Loading holidays…</p>
            )}

            {!loading && holidays.length > 0 && (
              <div
                ref={listRef}
                className="holiday-import-list holiday-import-scroll"
                role="listbox"
                aria-label="Holidays by month"
              >
                {filteredMonthGroups.length === 0 ? (
                  <p className="holiday-import-dialog__hint holiday-import-dialog__hint--inset">
                    No holidays match “{filterQuery.trim()}”.
                  </p>
                ) : (
                  filteredMonthGroups.map((group) => (
                    <section
                      key={group.monthIndex}
                      ref={(el) => {
                        if (el) monthRefs.current.set(group.monthIndex, el);
                        else monthRefs.current.delete(group.monthIndex);
                      }}
                      className={[
                        "holiday-import-month",
                        jumpMonth === group.monthIndex ? "is-focused" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
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
                  ))
                )}
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
            <div className="holiday-import-confirm-sections">
              <section className="holiday-import-confirm-block">
                <h3 className="holiday-import-confirm-block__title holiday-import-confirm-block__title--add">
                  New public holidays
                  <span>{newSelectedHolidays.length}</span>
                </h3>
                <p className="holiday-import-dialog__copy">
                  Only dates that are currently <strong>working days</strong>{" "}
                  and will become <strong>Public holiday</strong>
                  {alreadyOnCalendar.length || weekendSelected.length
                    ? ` (${[
                        alreadyOnCalendar.length
                          ? `${alreadyOnCalendar.length} already public holiday`
                          : null,
                        weekendSelected.length
                          ? `${weekendSelected.length} already weekend`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ")} not listed).`
                    : "."}
                </p>
                {confirmAddGroups.length === 0 ? (
                  <p className="holiday-import-dialog__hint">
                    None — no new public holidays to add.
                  </p>
                ) : (
                  <div className="holiday-import-confirm-list">
                    {confirmAddGroups.map((group) => (
                      <section
                        key={`add-${group.monthIndex}`}
                        className="holiday-import-month"
                      >
                        <h4 className="holiday-import-month__title">
                          {group.label} {year}
                        </h4>
                        <ul className="holiday-import-month__list">
                          {group.items.map((h) => (
                            <li
                              key={holidayKey(h)}
                              className="holiday-import-confirm-row"
                            >
                              <span className="holiday-import-list__date">
                                {shortDateLabel(h.date)}
                              </span>
                              <span className="holiday-import-list__weekday">
                                {weekdayLabel(h.date)}
                              </span>
                              <span className="holiday-import-list__name">
                                {h.title}
                              </span>
                              <span className="holiday-import-list__badge holiday-import-list__badge--add">
                                → Public holiday
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </section>

              <section className="holiday-import-confirm-block">
                <h3 className="holiday-import-confirm-block__title holiday-import-confirm-block__title--remove">
                  Remove public holiday
                  <span>{removedHolidays.length}</span>
                </h3>
                <p className="holiday-import-dialog__copy">
                  These existing calendar public holidays are not in your
                  selection and will be restored to{" "}
                  <strong>Working day</strong> or <strong>Weekend</strong>.
                  Click <strong>Keep</strong> to leave a date as a public
                  holiday.
                </p>
                {confirmRemoveGroups.length === 0 ? (
                  <p className="holiday-import-dialog__hint">
                    None — no existing public holidays will be removed.
                  </p>
                ) : (
                  <div className="holiday-import-confirm-list">
                    {confirmRemoveGroups.map((group) => (
                      <section
                        key={`rm-${group.monthIndex}`}
                        className="holiday-import-month"
                      >
                        <h4 className="holiday-import-month__title">
                          {group.label} {year}
                        </h4>
                        <ul className="holiday-import-month__list">
                          {group.items.map((h) => (
                            <li
                              key={`${h.date}|${h.title}|rm`}
                              className="holiday-import-confirm-row"
                            >
                              <span className="holiday-import-list__date">
                                {shortDateLabel(h.date)}
                              </span>
                              <span className="holiday-import-list__weekday">
                                {weekdayLabel(h.date)}
                              </span>
                              <span className="holiday-import-list__name">
                                {h.title}
                              </span>
                              <span className="holiday-import-list__badge holiday-import-list__badge--remove">
                                → {dayTypeLabel(h.restoreTo)}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                className="holiday-import-keep-btn"
                                onClick={() => keepExistingHoliday(h.date)}
                                disabled={importing}
                                title="Do not remove — keep as public holiday"
                              >
                                Keep
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </section>

              {keptHolidays.length > 0 && (
                <section className="holiday-import-confirm-block">
                  <h3 className="holiday-import-confirm-block__title holiday-import-confirm-block__title--keep">
                    Keeping as public holiday
                    <span>{keptHolidays.length}</span>
                  </h3>
                  <p className="holiday-import-dialog__copy">
                    These will stay as <strong>Public holiday</strong> and will
                    not be restored.
                  </p>
                  <div className="holiday-import-confirm-list">
                    {confirmKeptGroups.map((group) => (
                      <section
                        key={`keep-${group.monthIndex}`}
                        className="holiday-import-month"
                      >
                        <h4 className="holiday-import-month__title">
                          {group.label} {year}
                        </h4>
                        <ul className="holiday-import-month__list">
                          {group.items.map((h) => (
                            <li
                              key={`${h.date}|${h.title}|keep`}
                              className="holiday-import-confirm-row"
                            >
                              <span className="holiday-import-list__date">
                                {shortDateLabel(h.date)}
                              </span>
                              <span className="holiday-import-list__weekday">
                                {weekdayLabel(h.date)}
                              </span>
                              <span className="holiday-import-list__name">
                                {h.title}
                              </span>
                              <span className="holiday-import-list__badge holiday-import-list__badge--add">
                                → Public holiday
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                className="holiday-import-keep-btn"
                                onClick={() => undoKeepExistingHoliday(h.date)}
                                disabled={importing}
                                title="Put back on the remove list"
                              >
                                Undo
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <p className="holiday-import-dialog__hint">
              {newSelectedHolidays.length} working → public holiday
              {alreadyOnCalendar.length
                ? ` · ${alreadyOnCalendar.length} already public holiday`
                : ""}
              {weekendSelected.length
                ? ` · ${weekendSelected.length} already weekend`
                : ""}
              {keptHolidays.length
                ? ` · ${keptHolidays.length} kept`
                : ""}
              {removedHolidays.length
                ? ` · ${removedHolidays.length} restored to working/weekend`
                : ""}
              . Leave days are left unchanged.
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
                disabled={
                  loading ||
                  (selected.size === 0 && existingHolidays.length === 0)
                }
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
                disabled={
                  importing ||
                  (newSelectedHolidays.length === 0 &&
                    removedHolidays.length === 0 &&
                    keptHolidays.length === 0 &&
                    selectedHolidays.length === 0)
                }
              >
                {importing
                  ? "Applying…"
                  : newSelectedHolidays.length === 0 &&
                      removedHolidays.length === 0
                    ? "Done — no changes"
                    : "Confirm import"}
              </Button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
