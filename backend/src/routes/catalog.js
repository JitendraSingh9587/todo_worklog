const express = require("express");
const catalogStore = require("../catalogStore");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const doc = await catalogStore.getCatalog();
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

router.post("/clients", async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const client = await catalogStore.addClient(body.name);
    res.status(201).json(client);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 400 && status < 500) {
      res.status(status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.post("/projects", async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const project = await catalogStore.addProject(body.name, body.clientId);
    res.status(201).json(project);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 400 && status < 500) {
      res.status(status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.patch("/clients/:id", async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.isDeleted === true) {
      const client = await catalogStore.softDeleteClient(req.params.id);
      res.json(client);
      return;
    }
    res.status(400).json({ error: "Only isDeleted: true is supported" });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 400 && status < 500) {
      res.status(status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.patch("/projects/:id", async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.isDeleted === true) {
      const project = await catalogStore.softDeleteProject(req.params.id);
      res.json(project);
      return;
    }
    res.status(400).json({ error: "Only isDeleted: true is supported" });
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
