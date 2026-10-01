import Button from "../common/Button.jsx";
import SelectField from "../common/SelectField.jsx";
import DailyUpdateField from "./DailyUpdateField.jsx";
import { DAY_TYPE_LABELS, TIME_SPEND_OPTIONS } from "../../constants/months.js";

export default function DayEditor({
  heading,
  form,
  clients,
  projects,
  saving,
  onChange,
  onSave,
  onStatus,
}) {
  if (!form) {
    return (
      <section className="panel panel--editor" aria-label="Day editor">
        <div className="editor-head">
          <h2>{heading || "Select a date"}</h2>
        </div>
      </section>
    );
  }

  const dayTypeOptions = Object.entries(DAY_TYPE_LABELS).map(
    ([value, label]) => ({ value, label }),
  );
  const timeOptions = TIME_SPEND_OPTIONS.map((h) => ({
    value: String(h),
    label: `${h}hr`,
  }));
  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }));
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

  return (
    <section className="panel panel--editor" aria-label="Day editor">
      <div className="editor-head">
        <h2 id="editorHeading">{heading}</h2>
      </div>
      <form
        className="day-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          onSave();
        }}
      >
        <div className="field-grid">
          <label className="field">
            <span>Date</span>
            <input type="text" value={form.date} readOnly />
          </label>
          <SelectField
            label="Day type"
            value={form.dayType}
            onChange={(value) => onChange({ dayType: value })}
            options={dayTypeOptions}
          />
          <SelectField
            label="Time spend"
            value={String(form.timeSpend)}
            onChange={(value) => onChange({ timeSpend: Number(value) || 0 })}
            options={timeOptions}
          />
          <SelectField
            label="Client"
            value={form.clientId}
            onChange={(value) => onChange({ clientId: value })}
            options={clientOptions}
            placeholder="— None —"
          />
          <SelectField
            label="Project"
            className="field--span2"
            value={form.projectId}
            onChange={(value) => onChange({ projectId: value })}
            options={projectOptions}
            placeholder="— None —"
          />
        </div>

        <DailyUpdateField
          value={form.dailyUpdate}
          onChange={(dailyUpdate) => onChange({ dailyUpdate })}
          onStatus={onStatus}
        />

        <div className="form-actions">
          <Button type="submit" variant="primary" disabled={saving}>
            Save changes
          </Button>
        </div>
      </form>
    </section>
  );
}
