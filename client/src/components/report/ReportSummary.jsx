import { MONTH_NAMES } from "../../constants/months.js";

export default function ReportSummary({ year, month, rows, counts }) {
  const totalOffDays =
    (counts.weekend || 0) + (counts.holiday || 0) + (counts.leave || 0);

  return (
    <div className="report-summary">
      <p className="report-summary-text">
        {MONTH_NAMES[month - 1]} {year}: {rows.length} days — {counts.working}{" "}
        working, {counts.weekend} weekend, {counts.holiday} holiday,{" "}
        {counts.leave} leave.
      </p>
      <div className="report-summary-boxes">
        <div className="report-stat-box report-stat-box--working">
          <span className="report-stat-box__label">Working days</span>
          <span className="report-stat-box__value">{counts.working}</span>
        </div>
        <div className="report-stat-box report-stat-box--holiday">
          <span className="report-stat-box__label">
            Total holidays (off days)
          </span>
          <span className="report-stat-box__value">{totalOffDays}</span>
        </div>
      </div>
    </div>
  );
}
