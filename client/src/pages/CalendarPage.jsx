import { useCallback, useEffect, useMemo, useState } from "react";
import { calendarApi, catalogApi, todosApi } from "../api/client.js";
import AppShell from "../components/layout/AppShell.jsx";
import MonthNav from "../components/common/MonthNav.jsx";
import Button from "../components/common/Button.jsx";
import CalendarGrid from "../components/calendar/CalendarGrid.jsx";
import DayEditor from "../components/editor/DayEditor.jsx";
import TodoPanel from "../components/todos/TodoPanel.jsx";
import HolidayImportDialog from "../components/holidays/HolidayImportDialog.jsx";
import CreateCatalogDialog from "../components/catalog/CreateCatalogDialog.jsx";
import { MONTH_NAMES } from "../constants/months.js";
import { formatDailyUpdateBullets } from "../utils/dailyUpdate.js";
import { todayDateString } from "../utils/date.js";
import { buildMonthApiPayload, buildProjectEntries } from "../utils/payload.js";
import {
  rememberStickyClientProject,
  resolveDayClientProject,
} from "../utils/stickyDefaults.js";

export default function CalendarPage() {
  const [availableYears, setAvailableYears] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth());
  const [dayByDate, setDayByDate] = useState(() => new Map());
  const [todosByDate, setTodosByDate] = useState(() => new Map());
  const [catalog, setCatalog] = useState({ clients: [], projects: [] });
  const [selectedDate, setSelectedDate] = useState(null);
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState("");
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [catalogCreateOpen, setCatalogCreateOpen] = useState(false);

  const showStatus = useCallback((message, kind = "") => {
    setStatus(message || "");
    setStatusKind(kind || "");
  }, []);

  const activeClients = useMemo(
    () => (catalog.clients || []).filter((c) => c && !c.isDeleted),
    [catalog.clients],
  );
  const activeProjects = useMemo(
    () => (catalog.projects || []).filter((p) => p && !p.isDeleted),
    [catalog.projects],
  );

  const projectsForClient = useMemo(() => {
    const clientId = form?.clientId || "";
    if (!clientId) return activeProjects;
    const filtered = activeProjects.filter(
      (p) => !p.clientId || p.clientId === clientId,
    );
    return filtered.length ? filtered : activeProjects;
  }, [activeProjects, form?.clientId]);

  const loadYearData = useCallback(async (y) => {
    const doc = await calendarApi.getYear(y);
    setDayByDate(new Map((doc.days || []).map((d) => [d.date, d])));
  }, []);

  const loadTodos = useCallback(async () => {
    const doc = await todosApi.list();
    const next = new Map();
    for (const entry of doc.days || []) {
      if (entry?.date && Array.isArray(entry.todos) && entry.todos.length) {
        next.set(entry.date, entry.todos);
      }
    }
    setTodosByDate(next);
  }, []);

  const loadCatalog = useCallback(async () => {
    const doc = await catalogApi.get();
    setCatalog({
      clients: Array.isArray(doc.clients) ? doc.clients : [],
      projects: Array.isArray(doc.projects) ? doc.projects : [],
    });
  }, []);

  const selectDate = useCallback(
    (dateStr, daysMap = dayByDate, clients = activeClients, projects = activeProjects) => {
      setSelectedDate(dateStr);
      const day = daysMap.get(dateStr);
      if (!day) {
        setForm(null);
        showStatus("This date is not in the loaded year file.", "err");
        return;
      }
      const { clientId, projectId } = resolveDayClientProject(
        day,
        clients,
        projects,
      );
      setForm({
        date: dateStr,
        dayType: day.dayType || "working",
        timeSpend:
          day.timeSpend !== undefined && day.timeSpend !== null
            ? day.timeSpend
            : 8,
        clientId: clientId || "",
        projectId: projectId || "",
        dailyUpdate: formatDailyUpdateBullets(day.dailyUpdate || ""),
      });
      showStatus("");
    },
    [dayByDate, activeClients, activeProjects, showStatus],
  );

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
      const [ , , catalogDoc] = await Promise.all([
        loadYearData(nextYear),
        loadTodos(),
        catalogApi.get(),
      ]);
      const clients = Array.isArray(catalogDoc.clients) ? catalogDoc.clients : [];
      const projects = Array.isArray(catalogDoc.projects)
        ? catalogDoc.projects
        : [];
      setCatalog({ clients, projects });

      const today = todayDateString();
      const todayYear = new Date().getFullYear();
      const yearDoc = await calendarApi.getYear(nextYear);
      const map = new Map((yearDoc.days || []).map((d) => [d.date, d]));
      setDayByDate(map);

      if (todayYear === nextYear && map.has(today)) {
        setMonthIndex(new Date().getMonth());
        selectDate(today, map, clients, projects);
      } else if (selectedDate && map.has(selectedDate)) {
        selectDate(selectedDate, map, clients, projects);
      }
      showStatus("");
    } catch (e) {
      showStatus(e.message, "err");
    }
  }, [
    year,
    selectedDate,
    loadYearData,
    loadTodos,
    selectDate,
    showStatus,
  ]);

  useEffect(() => {
    refresh();
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getTodosForDate(dateStr) {
    const list = todosByDate.get(dateStr);
    return Array.isArray(list) ? list.slice() : [];
  }

  function getActiveTodos(dateStr) {
    return getTodosForDate(dateStr).filter((t) => !t.isDeleted);
  }

  function hasOpenTodo(dateStr) {
    return getActiveTodos(dateStr).some((t) => !t.done);
  }

  async function saveTodos(dateStr, items) {
    const result = await todosApi.putDay(dateStr, items);
    setTodosByDate((prev) => {
      const next = new Map(prev);
      next.set(dateStr, result.todos || items);
      return next;
    });
  }

  function handleFormChange(patch) {
    setForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "clientId")) {
        const projects = activeProjects.filter(
          (p) => !p.clientId || p.clientId === next.clientId,
        );
        if (
          next.projectId &&
          projects.length &&
          !projects.some((p) => p.id === next.projectId)
        ) {
          next.projectId = projects[0]?.id || "";
        }
        rememberStickyClientProject(next.clientId, next.projectId);
      }
      if (Object.prototype.hasOwnProperty.call(patch, "projectId")) {
        rememberStickyClientProject(next.clientId, next.projectId);
      }
      if (
        patch.dayType === "holiday" ||
        patch.dayType === "leave"
      ) {
        if (patch.timeSpend === undefined) next.timeSpend = 8;
      }
      return next;
    });
  }

  async function handleSave() {
    if (!selectedDate || !form) return;
    setSaving(true);
    showStatus("Saving…");
    try {
      const hours = Number(form.timeSpend) || 8;
      const dailyUpdate = formatDailyUpdateBullets(form.dailyUpdate);
      const clientId = form.clientId || null;
      const projectId = form.projectId || "";
      const existing = dayByDate.get(selectedDate);
      const projectEntries = buildProjectEntries(
        existing,
        projectId,
        clientId || "",
        hours,
        dailyUpdate,
      );
      const updated = await calendarApi.patchDay(year, selectedDate, {
        dailyUpdate,
        dayType: form.dayType,
        timeSpend: hours,
        clientId,
        projectEntries,
      });
      setDayByDate((prev) => {
        const next = new Map(prev);
        next.set(selectedDate, updated);
        return next;
      });
      rememberStickyClientProject(clientId || "", projectId || "");
      setForm((prev) =>
        prev
          ? {
              ...prev,
              dailyUpdate,
              timeSpend: hours,
              dayType: updated.dayType || prev.dayType,
            }
          : prev,
      );
      showStatus("Saved to data file.", "ok");
    } catch (e) {
      showStatus(e.message, "err");
    } finally {
      setSaving(false);
    }
  }

  function handleLogPayload() {
    const defaultProjectId = activeProjects[0]?.id || "";
    const payload = buildMonthApiPayload(
      dayByDate,
      year,
      monthIndex,
      defaultProjectId,
    );
    console.log(
      `API payload — ${MONTH_NAMES[monthIndex]} ${year}`,
      payload,
    );
    console.log(JSON.stringify(payload, null, 2));
    showStatus(
      `Logged ${payload.dailyEntries.length} days for ${MONTH_NAMES[monthIndex]} ${year} to the console.`,
      "ok",
    );
  }

  async function handleHolidaysImported(result) {
    try {
      await loadYearData(year);
      const doc = await calendarApi.getYear(year);
      const map = new Map((doc.days || []).map((d) => [d.date, d]));
      setDayByDate(map);
      if (selectedDate && map.has(selectedDate)) {
        selectDate(selectedDate, map, activeClients, activeProjects);
      }
      const years =
        Array.isArray(result.yearsTouched) && result.yearsTouched.length
          ? result.yearsTouched.join(", ")
          : "none";
      showStatus(
        `Holidays updated: ${result.updated || 0} public holiday` +
          (result.removed
            ? `, ${result.removed} restored to working/weekend`
            : "") +
          ` (years: ${years}).`,
        "ok",
      );
    } catch (e) {
      showStatus(e.message, "err");
    }
  }

  async function changeYear(nextYear) {
    setYear(nextYear);
    showStatus("Loading…");
    try {
      await loadYearData(nextYear);
      const doc = await calendarApi.getYear(nextYear);
      const map = new Map((doc.days || []).map((d) => [d.date, d]));
      setDayByDate(map);
      if (selectedDate && map.has(selectedDate)) {
        selectDate(selectedDate, map);
      } else {
        setSelectedDate(null);
        setForm(null);
      }
      showStatus("");
    } catch (e) {
      showStatus(e.message, "err");
    }
  }

  function handlePrevMonth() {
    let nextMonth = monthIndex - 1;
    let nextYear = year;
    if (nextMonth < 0) {
      const idx = availableYears.indexOf(year);
      if (idx > 0) {
        nextMonth = 11;
        nextYear = availableYears[idx - 1];
        setMonthIndex(nextMonth);
        changeYear(nextYear);
        return;
      }
      nextMonth = 0;
    }
    setMonthIndex(nextMonth);
  }

  function handleNextMonth() {
    let nextMonth = monthIndex + 1;
    if (nextMonth > 11) {
      const idx = availableYears.indexOf(year);
      if (idx >= 0 && idx < availableYears.length - 1) {
        setMonthIndex(0);
        changeYear(availableYears[idx + 1]);
        return;
      }
      nextMonth = 11;
    }
    setMonthIndex(nextMonth);
  }

  const selectedDay = selectedDate ? dayByDate.get(selectedDate) : null;
  const editorHeading = selectedDay
    ? `${selectedDay.weekday}, ${selectedDay.monthName} ${selectedDay.day}, ${year}`
    : "Select a date";
  const todoContext = selectedDay
    ? `${selectedDay.weekday}, ${selectedDay.monthName} ${selectedDay.day}, ${year}`
    : "Select a date in the calendar to manage todos for that day.";

  const yearOptions = availableYears.map((y) => (
    <option key={y} value={y}>
      {y}
    </option>
  ));

  return (
    <AppShell
      status={status}
      statusKind={statusKind}
      center={
        <>
          <label className="field-inline field-inline--compact">
            <span className="sr-only">Year</span>
            <select
              aria-label="Year"
              value={year}
              onChange={(e) => changeYear(Number(e.target.value))}
            >
              {yearOptions}
            </select>
          </label>
          <MonthNav
            title={`${MONTH_NAMES[monthIndex]} ${year}`}
            onPrev={handlePrevMonth}
            onNext={handleNextMonth}
          />
        </>
      }
      actions={
        <>
          <Button
            size="sm"
            onClick={() => setCatalogCreateOpen(true)}
            title="Create or remove clients and projects"
          >
            Clients / projects
          </Button>
          <Button
            size="sm"
            onClick={() => setImportOpen(true)}
            title="Fetch India public holidays and choose which to import"
          >
            Import holidays
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleLogPayload}
            title="Log current month in API payload format"
          >
            Log payload
          </Button>
        </>
      }
    >
      <main className="workspace">
        <section className="panel panel--calendar" aria-label="Calendar">
          <CalendarGrid
            year={year}
            monthIndex={monthIndex}
            dayByDate={dayByDate}
            selectedDate={selectedDate}
            hasOpenTodo={hasOpenTodo}
            onSelectDate={(dateStr) => selectDate(dateStr)}
          />
          <TodoPanel
            contextLabel={todoContext}
            items={selectedDate ? getActiveTodos(selectedDate) : []}
            disabled={!selectedDate || !selectedDay}
            onAdd={async (text) => {
              const items = getTodosForDate(selectedDate);
              items.push({
                id: crypto.randomUUID(),
                text,
                done: false,
                isDeleted: false,
              });
              await saveTodos(selectedDate, items);
              showStatus("Todo saved.", "ok");
            }}
            onToggle={async (id) => {
              const items = getTodosForDate(selectedDate).map((t) =>
                t.id === id ? { ...t, done: !t.done } : t,
              );
              await saveTodos(selectedDate, items);
            }}
            onDelete={async (id) => {
              const items = getTodosForDate(selectedDate).map((t) =>
                t.id === id ? { ...t, isDeleted: true } : t,
              );
              await saveTodos(selectedDate, items);
              showStatus("Todo marked deleted.", "ok");
            }}
          />
        </section>

        <DayEditor
          heading={editorHeading}
          form={form}
          clients={activeClients}
          projects={projectsForClient}
          saving={saving}
          onChange={handleFormChange}
          onSave={handleSave}
          onStatus={showStatus}
        />
      </main>

      <HolidayImportDialog
        open={importOpen}
        year={year}
        onClose={() => setImportOpen(false)}
        onImported={handleHolidaysImported}
        onStatus={showStatus}
      />
      <CreateCatalogDialog
        open={catalogCreateOpen}
        clients={activeClients}
        projects={activeProjects}
        onClose={() => setCatalogCreateOpen(false)}
        onChanged={async () => {
          try {
            await loadCatalog();
          } catch (e) {
            showStatus(e.message, "err");
          }
        }}
        onStatus={showStatus}
      />
    </AppShell>
  );
}
