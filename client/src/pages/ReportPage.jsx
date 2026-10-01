import { useCallback, useEffect, useMemo, useState } from "react";
import { calendarApi } from "../api/client.js";
import AppShell from "../components/layout/AppShell.jsx";
import MonthNav from "../components/common/MonthNav.jsx";
import Button from "../components/common/Button.jsx";
import ReportSummary from "../components/report/ReportSummary.jsx";
import ReportList from "../components/report/ReportList.jsx";
import { MONTH_NAMES } from "../constants/months.js";
import { daysInMonth } from "../utils/date.js";
import { inferDayType } from "../utils/dayType.js";

export default function ReportPage() {
  const [availableYears, setAvailableYears] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [dayByDate, setDayByDate] = useState(() => new Map());
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  const showStatus = useCallback((message, kind = "") => {
    setStatus(message || "");
    setStatusKind(kind || "");
  }, []);

  const loadYearData = useCallback(async (y) => {
    const doc = await calendarApi.getYear(y);
    setDayByDate(new Map((doc.days || []).map((d) => [d.date, d])));
  }, []);

  const refresh = useCallback(async () => {
    showStatus("Loading…");
    try {
      const { years } = await calendarApi.listYears();
      setAvailableYears(years || []);
      if (!years?.length) {
        showStatus("No year-*.json files found in the data folder.", "err");
        return;
      }
      let nextYear = year;
      if (!years.includes(nextYear)) {
        nextYear = years[years.length - 1];
        setYear(nextYear);
      }
      if (new Date().getFullYear() === nextYear) {
        setMonth(new Date().getMonth() + 1);
      }
      await loadYearData(nextYear);
      showStatus("");
    } catch (e) {
      showStatus(e.message, "err");
    }
  }, [year, loadYearData, showStatus]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { rows, counts } = useMemo(() => {
    const dim = daysInMonth(year, month);
    const nextRows = [];
    const nextCounts = { working: 0, weekend: 0, holiday: 0, leave: 0 };
    for (let d = 1; d <= dim; d += 1) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const day = dayByDate.get(dateStr);
      if (!day) continue;
      const dayType = inferDayType(day);
      const text = (day.dailyUpdate || "").trim();
      nextCounts[dayType] += 1;
      nextRows.push({ day, dayType, text, dateStr });
    }
    return { rows: nextRows, counts: nextCounts };
  }, [dayByDate, year, month]);

  async function changeYear(nextYear) {
    setYear(nextYear);
    if (nextYear === new Date().getFullYear()) {
      setMonth(new Date().getMonth() + 1);
    }
    showStatus("Loading…");
    try {
      await loadYearData(nextYear);
      showStatus("");
    } catch (e) {
      showStatus(e.message, "err");
    }
  }

  function handlePrevMonth() {
    let next = month - 1;
    if (next < 1) {
      const idx = availableYears.indexOf(year);
      if (idx > 0) {
        setMonth(12);
        changeYear(availableYears[idx - 1]);
        return;
      }
      next = 1;
    }
    setMonth(next);
  }

  function handleNextMonth() {
    let next = month + 1;
    if (next > 12) {
      const idx = availableYears.indexOf(year);
      if (idx >= 0 && idx < availableYears.length - 1) {
        setMonth(1);
        changeYear(availableYears[idx + 1]);
        return;
      }
      next = 12;
    }
    setMonth(next);
  }

  async function downloadPdf() {
    if (!availableYears.length) return;
    setPdfBusy(true);
    showStatus("Preparing PDF…");
    try {
      const url = calendarApi.reportPdfUrl(year, month);
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText || "PDF download failed");
      }
      const blob = await res.blob();
      const filename = `timesheet-${year}-${String(month).padStart(2, "0")}.pdf`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
      showStatus("PDF downloaded.", "ok");
    } catch (e) {
      showStatus(e.message, "err");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <AppShell
      shell={false}
      status={status}
      statusKind={statusKind}
      center={
        <>
          <label className="field-inline">
            <span>Year</span>
            <select
              value={year}
              onChange={(e) => changeYear(Number(e.target.value))}
              aria-label="Year"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline">
            <span>Month</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              aria-label="Month"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <MonthNav
            title={`${MONTH_NAMES[month - 1]} ${year}`}
            onPrev={handlePrevMonth}
            onNext={handleNextMonth}
          />
        </>
      }
      actions={
        <Button
          variant="primary"
          size="sm"
          onClick={downloadPdf}
          disabled={pdfBusy || !availableYears.length}
        >
          Download PDF
        </Button>
      }
    >
      <header className="header">
        <h1>Monthly report</h1>
        <p className="subtitle">
          Day-by-day list for the selected month (updates, weekends, holidays,
          leave).
        </p>
      </header>
      <ReportSummary year={year} month={month} rows={rows} counts={counts} />
      <ReportList rows={rows} year={year} onStatus={showStatus} />
    </AppShell>
  );
}
