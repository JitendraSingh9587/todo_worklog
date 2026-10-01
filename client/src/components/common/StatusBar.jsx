export default function StatusBar({ message = "", kind = "" }) {
  return (
    <div
      id="statusMessage"
      className={`status status--bar${kind ? ` ${kind}` : ""}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
