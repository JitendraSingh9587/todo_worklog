const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = process.env.CALENDAR_DATA_DIR
  ? path.resolve(process.env.CALENDAR_DATA_DIR)
  : path.join(__dirname, "..", "data");

const TODOS_FILE = path.join(DATA_DIR, "todos.json");
const MAX_TODO_TEXT_LENGTH = 500;
const MAX_TODOS_PER_DAY = 200;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let writeChain = Promise.resolve();

/**
 * @param {() => Promise<unknown>} fn
 */
function serializeWrite(fn) {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => {});
  return next;
}

function emptyDocument() {
  return {
    schemaVersion: 1,
    about:
      "Todo sheet: only dates with todos are stored. Soft-delete with isDeleted true/false — todos are never removed from the sheet.",
    days: [],
  };
}

/**
 * @returns {Promise<object>}
 */
async function readDocument() {
  try {
    const raw = await fs.readFile(TODOS_FILE, "utf8");
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== "object" || !Array.isArray(doc.days)) {
      return emptyDocument();
    }
    return doc;
  } catch (err) {
    if (err.code === "ENOENT") {
      return emptyDocument();
    }
    throw err;
  }
}

/**
 * @param {object} doc
 */
async function writeDocument(doc) {
  const tmp = `${TODOS_FILE}.${process.pid}.tmp`;
  const content = `${JSON.stringify(doc, null, 2)}\n`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, TODOS_FILE);
}

/**
 * @returns {Promise<{ schemaVersion: number, about: string, days: Array<{ date: string, todos: Array<object> }> }>}
 */
async function getAllTodos() {
  const doc = await readDocument();
  const days = doc.days
    .filter(
      (entry) =>
        entry &&
        typeof entry.date === "string" &&
        DATE_RE.test(entry.date) &&
        Array.isArray(entry.todos) &&
        entry.todos.length > 0,
    )
    .map((entry) => ({
      date: entry.date,
      todos: entry.todos.map(normalizeTodo).filter(Boolean),
    }))
    .filter((entry) => entry.todos.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    schemaVersion: doc.schemaVersion || 1,
    about: doc.about || emptyDocument().about,
    days,
  };
}

/**
 * @param {unknown} raw
 */
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

/**
 * Replace todos for a date. Never removes the date entry when todos exist
 * (including soft-deleted). Empty array keeps/creates an empty day list only
 * if the date already exists; otherwise no-op for empty create.
 * @param {string} date
 * @param {unknown} todosRaw
 */
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
      e.statusCode = 400;
      throw e;
    }
    seenIds.add(todo.id);
    todos.push(todo);
  }

  return serializeWrite(async () => {
    const doc = await readDocument();
    if (!Array.isArray(doc.days)) doc.days = [];

    if (todos.length === 0) {
      const e = new Error(
        "Empty todos list is not allowed; set isDeleted: true to soft-delete",
      );
      e.statusCode = 400;
      throw e;
    }

    const idx = doc.days.findIndex((d) => d && d.date === date);
    if (idx === -1) {
      doc.days.push({ date, todos });
    } else {
      doc.days[idx] = { date, todos };
    }

    doc.days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    await writeDocument(doc);
    return { date, todos };
  });
}

module.exports = {
  TODOS_FILE,
  getAllTodos,
  setTodosForDate,
};
