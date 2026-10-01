import { useState } from "react";
import CopyIcon from "../common/CopyIcon.jsx";
import PasteIcon from "../common/PasteIcon.jsx";
import { formatDailyUpdateBullets } from "../../utils/dailyUpdate.js";

export default function DailyUpdateField({ value, onChange, onStatus }) {
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState(false);

  function handleKeyDown(ev) {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    const el = ev.target;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${value.slice(0, start)}\n- ${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      const caret = start + 3;
      el.setSelectionRange(caret, caret);
    });
  }

  async function handleCopy() {
    const text = formatDailyUpdateBullets(value).trim();
    if (!text || text === "-") {
      onStatus?.("No daily update to copy.", "err");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      onStatus?.("Daily update copied.", "ok");
    } catch {
      onStatus?.("Could not copy to clipboard.", "err");
    }
  }

  async function handlePaste() {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip || !clip.trim()) {
        onStatus?.("Clipboard is empty.", "err");
        return;
      }
      onChange(formatDailyUpdateBullets(clip));
      setPasted(true);
      setTimeout(() => setPasted(false), 1200);
      onStatus?.("Pasted into daily update.", "ok");
    } catch {
      onStatus?.(
        "Could not paste from clipboard. Allow clipboard permission for this site.",
        "err",
      );
    }
  }

  return (
    <div className="field field--grow">
      <div className="field-label-row">
        <span>Daily update</span>
        <div className="field-label-actions">
          <button
            type="button"
            className={`report-copy-btn${copied ? " is-copied" : ""}`}
            onClick={handleCopy}
            aria-label="Copy daily update"
            title={copied ? "Copied!" : "Copy daily update"}
          >
            <CopyIcon />
          </button>
          <button
            type="button"
            className={`report-copy-btn${pasted ? " is-copied" : ""}`}
            onClick={handlePaste}
            aria-label="Paste daily update"
            title={pasted ? "Pasted!" : "Paste daily update"}
          >
            <PasteIcon />
          </button>
        </div>
      </div>
      <textarea
        rows={8}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onChange(formatDailyUpdateBullets(value))}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (!value.trim()) onChange("- ");
        }}
        placeholder={"- First task\n- Second task\n- Third task"}
      />
    </div>
  );
}
