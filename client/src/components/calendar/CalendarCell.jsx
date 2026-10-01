import { cellClassForDay } from "../../utils/dayType.js";

export default function CalendarCell({
  dayNumber,
  dateStr,
  day,
  selected,
  hasLog,
  hasOpenTodo,
  onSelect,
  disabled = false,
}) {
  if (disabled) {
    return <button type="button" className="cal-cell" disabled />;
  }

  const className = [
    "cal-cell",
    cellClassForDay(day),
    selected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      onClick={() => onSelect(dateStr)}
    >
      <span className="d-num">{dayNumber}</span>
      {(hasLog || hasOpenTodo) && (
        <span className="d-dots">
          {hasLog ? <span className="d-dot" aria-hidden="true" /> : null}
          {hasOpenTodo ? (
            <span className="d-dot d-dot--todo" aria-hidden="true" />
          ) : null}
        </span>
      )}
    </button>
  );
}
