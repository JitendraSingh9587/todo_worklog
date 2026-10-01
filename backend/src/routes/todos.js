const express = require("express");
const todoStore = require("../todoStore");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const doc = await todoStore.getAllTodos();
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

router.get("/:date", async (req, res, next) => {
  try {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "Invalid date format; use YYYY-MM-DD" });
      return;
    }
    const doc = await todoStore.getAllTodos();
    const entry = doc.days.find((d) => d.date === date);
    res.json({ date, todos: entry ? entry.todos : [] });
  } catch (err) {
    next(err);
  }
});

router.put("/:date", async (req, res, next) => {
  try {
    const date = req.params.date;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!Object.prototype.hasOwnProperty.call(body, "todos")) {
      res.status(400).json({ error: "Provide todos array" });
      return;
    }
    const result = await todoStore.setTodosForDate(date, body.todos);
    res.json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 400 && status < 500) {
      res.status(status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

module.exports = router;
