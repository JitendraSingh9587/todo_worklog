const mysql = require("mysql2/promise");
const { createLogger } = require("../logger");
const { readDbConfig } = require("./config");

const logger = createLogger();

let pool = null;

function getPool() {
  if (!pool) {
    const e = new Error("Database pool is not initialized");
    e.statusCode = 503;
    throw e;
  }
  return pool;
}

function baseConnectionOptions(cfg) {
  return {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    waitForConnections: cfg.waitForConnections,
    connectionLimit: cfg.connectionLimit,
    charset: cfg.charset,
    dateStrings: cfg.dateStrings,
    supportBigNumbers: cfg.supportBigNumbers,
  };
}

/**
 * Connect to DB_NAME. If the database is missing, create it (not tables).
 * @returns {Promise<import("mysql2/promise").Pool>}
 */
async function createPool() {
  const cfg = readDbConfig();
  const withDb = { ...baseConnectionOptions(cfg), database: cfg.database };

  try {
    const next = mysql.createPool(withDb);
    await next.query("SELECT 1");
    logger.info("Connected to MySQL", {
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
    });
    pool = next;
    return pool;
  } catch (err) {
    if (err.code !== "ER_BAD_DB_ERROR") {
      logger.error("MySQL connection failed", {
        host: cfg.host,
        port: cfg.port,
        database: cfg.database,
        code: err.code,
        message: err.message,
      });
      throw err;
    }
  }

  const admin = await mysql.createConnection(baseConnectionOptions(cfg));
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${cfg.database.replace(/`/g, "")}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    logger.info("Created database", { database: cfg.database });
  } finally {
    await admin.end();
  }

  const next = mysql.createPool(withDb);
  await next.query("SELECT 1");
  pool = next;
  return pool;
}

async function pingDb() {
  try {
    const db = getPool();
    await db.query("SELECT 1");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = {
  createPool,
  getPool,
  pingDb,
  closePool,
};
