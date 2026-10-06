function readDbConfig() {
  const database = (process.env.DB_NAME || "time_sheet").trim();
  const host = (process.env.DB_HOST || "localhost").trim();
  const port = Number(process.env.DB_PORT) || 3306;
  const user = (process.env.DB_USER || "root").trim();
  const password =
    process.env.DB_PASSWORD === undefined ? "" : String(process.env.DB_PASSWORD);
  const connectionLimit = Number(process.env.DB_POOL_MAX) || 10;

  return {
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit,
    namedPlaceholders: false,
    charset: "utf8mb4",
    dateStrings: true,
    supportBigNumbers: true,
  };
}

module.exports = { readDbConfig };
