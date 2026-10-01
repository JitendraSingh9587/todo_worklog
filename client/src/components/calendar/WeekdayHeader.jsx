const LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function WeekdayHeader() {
  return (
    <div className="weekday-row">
      {LABELS.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}
