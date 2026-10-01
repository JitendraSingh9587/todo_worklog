import { useEffect, useRef, useState } from "react";
import Button from "../common/Button.jsx";
import { WORKLOG_COOKIE_KEY } from "../../constants/storageKeys.js";

function readCookie() {
  try {
    return localStorage.getItem(WORKLOG_COOKIE_KEY) || "";
  } catch {
    return "";
  }
}

function writeCookie(value) {
  try {
    if (value) localStorage.setItem(WORKLOG_COOKIE_KEY, value);
    else localStorage.removeItem(WORKLOG_COOKIE_KEY);
  } catch {
    /* ignore */
  }
}

export function getSavedWorklogCookie() {
  return readCookie();
}

export default function WorklogAuthDialog({
  open,
  onClose,
  onSaved,
  onStatus,
}) {
  const dialogRef = useRef(null);
  const [cookie, setCookie] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setCookie(readCookie());
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleClear() {
    writeCookie("");
    setCookie("");
    onStatus?.("Saved Worklog cookie cleared.", "ok");
  }

  function handleSave(ev) {
    ev.preventDefault();
    const trimmed = cookie.trim();
    if (!trimmed) {
      onStatus?.("Paste the Worklog Cookie header value first.", "err");
      return;
    }
    writeCookie(trimmed);
    onSaved?.(trimmed);
    onClose?.();
  }

  return (
    <dialog
      ref={dialogRef}
      className="auth-dialog"
      onClose={onClose}
      onCancel={onClose}
    >
      <form className="auth-dialog-form" onSubmit={handleSave}>
        <h2 className="auth-dialog-title">Worklog session</h2>
        <p className="auth-dialog-copy">
          Login on{" "}
          <a
            href="https://worklog.kadellabs.com/employee"
            target="_blank"
            rel="noopener noreferrer"
          >
            worklog.kadellabs.com
          </a>{" "}
          is not available to this local app. Paste the <strong>Cookie</strong>{" "}
          header from a Worklog API request:
        </p>
        <ol className="auth-dialog-steps">
          <li>Open Worklog while logged in</li>
          <li>
            DevTools → Network → refresh → click <code>/api/holidays</code>
          </li>
          <li>
            Request Headers → copy the full <code>Cookie</code> value
          </li>
        </ol>
        <label className="field">
          <span>Session cookie</span>
          <textarea
            rows={4}
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            placeholder="name=value; other=value; …"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <div className="auth-dialog-actions">
          <Button type="button" size="sm" onClick={handleClear}>
            Clear saved
          </Button>
          <Button type="button" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm">
            Save &amp; sync
          </Button>
        </div>
      </form>
    </dialog>
  );
}
