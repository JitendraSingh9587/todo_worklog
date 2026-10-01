/**
 * Lightweight JSON logger for structured console output.
 * @param {{ level?: string }} [options]
 */
function createLogger(options = {}) {
  const configuredLevel = process.env.LOG_LEVEL || options.level || "info";
  const order = { error: 0, warn: 1, info: 2, debug: 3 };

  function shouldLog(level) {
    return order[level] <= order[configuredLevel];
  }

  function log(level, msg, meta = {}) {
    if (!shouldLog(level)) return;
    const line = {
      t: new Date().toISOString(),
      level,
      msg,
      ...meta,
    };
    const text = JSON.stringify(line);
    if (level === "error") console.error(text);
    else console.log(text);
  }

  return {
    info: (msg, meta) => log("info", msg, meta),
    warn: (msg, meta) => log("warn", msg, meta),
    error: (msg, meta) => log("error", msg, meta),
    debug: (msg, meta) => log("debug", msg, meta),
  };
}

module.exports = { createLogger };
