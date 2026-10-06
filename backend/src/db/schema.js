const { createLogger } = require("../logger");

const logger = createLogger();

const TABLE_NAMES = [
  "clients",
  "projects",
  "calendar_days",
  "project_entries",
  "todos",
];

/**
 * CREATE TABLE IF NOT EXISTS only. Never ALTER / DROP / TRUNCATE.
 * If a table already exists, MySQL leaves it (and its rows) unchanged.
 */
const CREATE_TABLE_SQL = {
  clients: `
    CREATE TABLE IF NOT EXISTS clients (
      id CHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  projects: `
    CREATE TABLE IF NOT EXISTS projects (
      id CHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      client_id CHAR(36) NULL,
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      KEY idx_projects_client (client_id),
      CONSTRAINT fk_projects_client
        FOREIGN KEY (client_id) REFERENCES clients (id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  calendar_days: `
    CREATE TABLE IF NOT EXISTS calendar_days (
      date DATE NOT NULL,
      year SMALLINT NOT NULL,
      month TINYINT NOT NULL,
      month_name VARCHAR(16) NOT NULL,
      day TINYINT NOT NULL,
      weekday VARCHAR(16) NOT NULL,
      is_holiday TINYINT(1) NOT NULL DEFAULT 0,
      holiday_reason VARCHAR(32) NULL,
      holiday_title VARCHAR(255) NULL,
      daily_update TEXT NULL,
      time_spend TINYINT UNSIGNED NOT NULL DEFAULT 8,
      client_id CHAR(36) NULL,
      PRIMARY KEY (date),
      KEY idx_calendar_days_year_month (year, month),
      KEY idx_calendar_days_client (client_id),
      CONSTRAINT fk_calendar_days_client
        FOREIGN KEY (client_id) REFERENCES clients (id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  project_entries: `
    CREATE TABLE IF NOT EXISTS project_entries (
      entry_id CHAR(36) NOT NULL,
      date DATE NOT NULL,
      project_id CHAR(36) NOT NULL,
      client_id CHAR(36) NULL,
      hours TINYINT UNSIGNED NOT NULL DEFAULT 8,
      task_description TEXT NULL,
      PRIMARY KEY (entry_id),
      KEY idx_project_entries_date (date),
      KEY idx_project_entries_project (project_id),
      CONSTRAINT fk_project_entries_date
        FOREIGN KEY (date) REFERENCES calendar_days (date)
        ON DELETE CASCADE,
      CONSTRAINT fk_project_entries_project
        FOREIGN KEY (project_id) REFERENCES projects (id),
      CONSTRAINT fk_project_entries_client
        FOREIGN KEY (client_id) REFERENCES clients (id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  todos: `
    CREATE TABLE IF NOT EXISTS todos (
      id VARCHAR(64) NOT NULL,
      date DATE NOT NULL,
      text VARCHAR(500) NOT NULL,
      done TINYINT(1) NOT NULL DEFAULT 0,
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      KEY idx_todos_date (date),
      CONSTRAINT fk_todos_date
        FOREIGN KEY (date) REFERENCES calendar_days (date)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
};

/**
 * Create only tables that are missing. Existing tables are never altered.
 * @param {import("mysql2/promise").Pool} pool
 * @param {string} database
 */
async function ensureTables(pool, database) {
  const placeholders = TABLE_NAMES.map(() => "?").join(", ");
  const [rows] = await pool.query(
    `SELECT TABLE_NAME AS name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders})`,
    [database, ...TABLE_NAMES],
  );
  const existing = new Set(
    (rows || []).map((r) => String(r.name).toLowerCase()),
  );

  const created = [];
  const skipped = [];

  for (const name of TABLE_NAMES) {
    if (existing.has(name)) {
      skipped.push(name);
      continue;
    }
    await pool.query(CREATE_TABLE_SQL[name]);
    created.push(name);
    logger.info("Created missing table", { table: name });
  }

  if (skipped.length) {
    logger.info("Existing tables left unchanged", { tables: skipped });
  }
  if (created.length === 0) {
    logger.info("All required tables already present; no schema changes");
  }

  return { created, skipped };
}

module.exports = {
  TABLE_NAMES,
  CREATE_TABLE_SQL,
  ensureTables,
};
