const { getPool } = require("./db/pool");

const MAX_TODO_TEXT_LENGTH = 500;
const MAX_TODOS_PER_DAY = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ABOUT =
  "Todo sheet: only dates with todos are stored. Soft-delete with isDeleted true/false — todos are never removed from the sheet.";

function formatDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function rowToTodo(row) {
  return {
    id: row.id,
    text: row.text,
    done: Boolean(row.done),
    isDeleted: Boolean(row.is_deleted),
  };
}

function normalizeTodo(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!id || !text) return null;
  if (text.length > MAX_TODO_TEXT_LENGTH) return null;
  return {
    id,
    text,
    done: Boolean(raw.done),
    isDeleted: Boolean(raw.isDeleted),
  };
}

async function getAllTodos() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, date, text, done, is_deleted
     FROM todos
     ORDER BY date ASC, id ASC`,
  );
  const byDate = new Map();
  for (const row of rows) {
    const date = formatDate(row.date);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(rowToTodo(row));
  }
  const days = [...byDate.entries()]
    .filter(([, todos]) => todos.length > 0)
    .map(([date, todos]) => ({ date, todos }));
  return {
    schemaVersion: 1,
    about: ABOUT,
    days,
  };
}

async function setTodosForDate(date, todosRaw) {
  if (!DATE_RE.test(date)) {
    const e = new Error("Invalid date format; use YYYY-MM-DD");
    e.statusCode = 400;
    throw e;
  }
  if (!Array.isArray(todosRaw)) {
    const e = new Error("todos must be an array");
    e.statusCode = 400;
    throw e;
  }
  if (todosRaw.length > MAX_TODOS_PER_DAY) {
    const e = new Error(`At most ${MAX_TODOS_PER_DAY} todos per day`);
    e.statusCode = 400;
    throw e;
  }

  const todos = [];
  const seenIds = new Set();
  for (const item of todosRaw) {
    const todo = normalizeTodo(item);
    if (!todo) {
      const e = new Error(
        "Each todo needs string id, non-empty text (max 500), done, and isDeleted",
      );
      e.statusCode = 400;
      throw e;
    }
    if (seenIds.has(todo.id)) {
      const e = new Error(`Duplicate todo id: ${todo.id}`);
      e.statusCode = 409;
      throw e;
    }
    seenIds.add(todo.id);
    todos.push(todo);
  }

  if (todos.length === 0) {
    const e = new Error(
      "Empty todos list is not allowed; set isDeleted: true to soft-delete",
    );
    e.statusCode = 400;
    throw e;
  }

  const pool = getPool();
  const [dayRows] = await pool.query(
    "SELECT date FROM calendar_days WHERE date = ? LIMIT 1",
    [date],
  );
  if (!dayRows.length) {
    const e = new Error("Date not found in calendar");
    e.statusCode = 404;
    throw e;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM todos WHERE date = ?", [date]);
    const values = todos.map((t) => [
      t.id,
      date,
      t.text,
      t.done ? 1 : 0,
      t.isDeleted ? 1 : 0,
    ]);
    await conn.query(
      "INSERT INTO todos (id, date, text, done, is_deleted) VALUES ?",
      [values],
    );
    await conn.commit();
    return { date, todos };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  getAllTodos,
  setTodosForDate,
};
