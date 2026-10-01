export default function TodoItem({ item, onToggle, onDelete }) {
  return (
    <li className={`todo-item${item.done ? " is-done" : ""}`}>
      <input
        type="checkbox"
        className="todo-check"
        checked={Boolean(item.done)}
        onChange={() => onToggle(item.id)}
        aria-label={`Done: ${item.text}`}
      />
      <span className="todo-item-text">{item.text}</span>
      <button
        type="button"
        className="todo-delete"
        onClick={() => onDelete(item.id)}
        aria-label={`Remove: ${item.text}`}
      >
        Remove
      </button>
    </li>
  );
}
