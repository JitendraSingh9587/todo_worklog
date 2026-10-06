const { createLogger } = require("../logger");
const { readDbConfig } = require("./config");
const { createPool } = require("./pool");
const { ensureTables } = require("./schema");
const { seedEmptyTables } = require("./seed");

const logger = createLogger();

/**
 * Connect, create missing tables only, generate 2026+ years if missing.
 * Existing tables and rows are never altered or overwritten.
 */
async function bootstrapDb() {
  const cfg = readDbConfig();
  const pool = await createPool();
  const { created, skipped } = await ensureTables(pool, cfg.database);
  logger.info("Schema bootstrap complete", {
    created,
    skipped,
    altered: [],
  });
  await seedEmptyTables(pool);
  return pool;
}

module.exports = { bootstrapDb };
