import { toDateString } from "../../utils/date.js";
import CalendarCell from "./CalendarCell.jsx";
import WeekdayHeader from "./WeekdayHeader.jsx";

export default function CalendarGrid({
  year,
  monthIndex,
  dayByDate,
  selectedDate,
  hasOpenTodo,
  onSelectDate,
}) {
  const first = new Date(year, monthIndex, 1);
  const startPad = first.getDay();
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < startPad; i += 1) {
    cells.push(
      <CalendarCell key={`pad-${i}`} disabled dayNumber={null} dateStr="" />,
    );
  }

  for (let d = 1; d <= lastDay; d += 1) {
    const dateStr = toDateString(year, monthIndex, d);
    const day = dayByDate.get(dateStr);
    cells.push(
      <CalendarCell
        key={dateStr}
        dayNumber={d}
        dateStr={dateStr}
        day={day}
        selected={selectedDate === dateStr}
        hasLog={Boolean(day && day.dailyUpdate && day.dailyUpdate.trim())}
        hasOpenTodo={hasOpenTodo(dateStr)}
        onSelect={onSelectDate}
      />,
    );
  }

  return (
    <>
      <WeekdayHeader />
      <div id="calendarGrid" className="calendar-grid">
        {cells}
      </div>
    </>
  );
}
