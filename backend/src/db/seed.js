const { createLogger } = require("../logger");
const { ensureDefaultYearRange } = require("./calendarYears");

const logger = createLogger();

const SAMPLE_CLIENT_ID = "f9c556ac-2940-4bf1-9315-05799a732109";

async function tableCount(pool, table) {
  const [rows] = await pool.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
  return Number(rows[0].n) || 0;
}

async function seedClients(pool) {
  if ((await tableCount(pool, "clients")) > 0) {
    logger.info("Skipping client seed; table already has rows");
    return;
  }
  await pool.query(
    "INSERT INTO clients (id, name, is_deleted) VALUES (?, ?, 0)",
    [SAMPLE_CLIENT_ID, "ALLCAD"],
  );
  logger.info("Seeded default client", { id: SAMPLE_CLIENT_ID });
}

async function seedProjects(pool) {
  if ((await tableCount(pool, "projects")) > 0) {
    logger.info("Skipping project seed; table already has rows");
    return;
  }
  await pool.query(
    "INSERT INTO projects (id, name, client_id, is_deleted) VALUES (?, ?, ?, 0)",
    [SAMPLE_CLIENT_ID, "DIGITAL EYE", SAMPLE_CLIENT_ID],
  );
  logger.info("Seeded default project", { id: SAMPLE_CLIENT_ID });
}

/**
 * Insert defaults and missing years only. Never UPDATE/DELETE existing rows.
 * @param {import("mysql2/promise").Pool} pool
 */
async function seedEmptyTables(pool) {
  await seedClients(pool);
  await seedProjects(pool);
  await ensureDefaultYearRange(pool);
}

module.exports = {
  seedEmptyTables,
};
