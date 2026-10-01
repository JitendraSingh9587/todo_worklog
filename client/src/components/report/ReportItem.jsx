import { useState } from "react";
import CopyIcon from "../common/CopyIcon.jsx";
import { DAY_TYPE_LABELS } from "../../constants/months.js";

export default function ReportItem({ day, dayType, text, year, onStatus }) {
  const [copied, setCopied] = useState(false);
  const dateLabel = `${day.weekday}, ${day.monthName} ${day.day}, ${year}`;
  const typeLabel = DAY_TYPE_LABELS[dayType] || dayType;

  async function handleCopy() {
    if (!text) {
      onStatus?.("No daily update to copy for this day.", "err");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      onStatus?.("Could not copy to clipboard.", "err");
    }
  }

  return (
    <li className="report-item">
      <div className="report-item-meta">
        <div className="report-item-date-row">
          <span className="report-item-date">{dateLabel}</span>
          <button
            type="button"
            className={`report-copy-btn${copied ? " is-copied" : ""}`}
            onClick={handleCopy}
            aria-label={`Copy ${dateLabel}`}
            title={copied ? "Copied!" : "Copy day data"}
          >
            <CopyIcon />
          </button>
        </div>
        <span className={`report-badge report-type-${dayType}`}>
          {typeLabel}
        </span>
      </div>
      {text ? (
        <div className="report-item-body">
          <pre className="report-item-text">{text}</pre>
        </div>
      ) : dayType === "working" ? (
        <div className="report-item-body">
          <p className="report-item-empty">No daily update.</p>
        </div>
      ) : null}
    </li>
  );
}
