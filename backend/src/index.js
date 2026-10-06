require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
  override: true,
});

const path = require("path");
const fs = require("fs");
const express = require("express");
const { createLogger } = require("./logger");
const calendarRouter = require("./routes/calendar");
const todosRouter = require("./routes/todos");
const catalogRouter = require("./routes/catalog");
const { bootstrapDb } = require("./db/bootstrap");
const { pingDb, closePool } = require("./db/pool");

const logger = createLogger();
const app = express();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";

// Monorepo: backend/src → ../../client/dist (works locally and in Docker)
const clientDistDir = process.env.CLIENT_DIST_DIR
  ? path.resolve(process.env.CLIENT_DIST_DIR)
  : path.join(__dirname, "..", "..", "client", "dist");

app.disable("x-powered-by");
app.use(express.json({ limit: "512kb" }));

app.get("/health", async (req, res) => {
  const db = await pingDb();
  res.status(db.ok ? 200 : 503).json({
    status: db.ok ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    ui: "react",
    database: db.ok,
  });
});

app.use("/api/calendar", calendarRouter);
app.use("/api/todos", todosRouter);
app.use("/api/catalog", catalogRouter);

app.use(express.static(clientDistDir));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }
  const indexPath = path.join(clientDistDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    res.status(404).json({
      error: "UI not built. Run npm run build:client",
    });
    return;
  }
  res.sendFile(indexPath);
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, _next) => {
  logger.error("Unhandled error", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message,
  });
});

let server;

async function start() {
  try {
    await bootstrapDb();
    server = app.listen(port, host, () => {
      logger.info("Server listening", {
        host,
        port,
        env: process.env.NODE_ENV || "development",
        staticDir: clientDistDir,
      });
    });

    server.on("error", (err) => {
      logger.error("Server error", { message: err.message });
      process.exit(1);
    });
  } catch (err) {
    logger.error("Failed to start server", {
      message: err.message,
      code: err.code,
    });
    process.exit(1);
  }
}

function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  const finish = async () => {
    try {
      await closePool();
    } catch (err) {
      logger.error("Error closing database pool", { message: err.message });
    }
    process.exit(0);
  };
  if (server) {
    server.close(() => {
      finish();
    });
    return;
  }
  finish();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start();
