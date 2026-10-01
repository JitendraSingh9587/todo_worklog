import ReportItem from "./ReportItem.jsx";

export default function ReportList({ rows, year, onStatus }) {
  return (
    <ul className="report-list" id="reportList">
      {rows.map(({ day, dayType, text, dateStr }) => (
        <ReportItem
          key={dateStr}
          day={day}
          dayType={dayType}
          text={text}
          year={year}
          onStatus={onStatus}
        />
      ))}
    </ul>
  );
}
