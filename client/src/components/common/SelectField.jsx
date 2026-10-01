export default function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  id,
  className = "",
  disabled = false,
}) {
  return (
    <label className={`field ${className}`.trim()}>
      {label ? <span>{label}</span> : null}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label || undefined}
      >
        {placeholder !== undefined ? (
          <option value="">{placeholder}</option>
        ) : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
