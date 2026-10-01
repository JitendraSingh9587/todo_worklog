import { useState } from "react";
import Button from "../common/Button.jsx";
import TodoItem from "./TodoItem.jsx";

export default function TodoPanel({
  contextLabel,
  items,
  disabled,
  onAdd,
  onToggle,
  onDelete,
}) {
  const [text, setText] = useState("");

  async function handleSubmit(ev) {
    ev.preventDefault();
    const value = text.trim();
    if (!value || disabled) return;
    await onAdd(value);
    setText("");
  }

  return (
    <section className="todo-section" aria-label="Todos for selected day">
      <div className="todo-head">
        <h2 className="todo-heading">Todos</h2>
        <p className="todo-context">{contextLabel}</p>
      </div>
      <form className="todo-add-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task…"
          maxLength={500}
          autoComplete="off"
          disabled={disabled}
          aria-label="New todo text"
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          className="todo-add-btn"
          disabled={disabled}
        >
          Add
        </Button>
      </form>
      <ul className="todo-list" role="list">
        {!items.length ? (
          <li className="todo-empty">No tasks yet.</li>
        ) : (
          items.map((item) => (
            <TodoItem
              key={item.id}
              item={item}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))
        )}
      </ul>
    </section>
  );
}
