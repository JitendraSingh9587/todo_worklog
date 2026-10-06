const crypto = require("crypto");
const { getPool } = require("./db/pool");

const SAMPLE_PROJECT_ID = "f9c556ac-2940-4bf1-9315-05799a732109";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ABOUT =
  "Clients and projects master data. Soft-delete with isDeleted. Sample projectId from API payload is seeded.";

function rowToClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    isDeleted: Boolean(row.is_deleted),
  };
}

function rowToProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id || null,
    isDeleted: Boolean(row.is_deleted),
  };
}

async function getCatalog() {
  const pool = getPool();
  const [clients] = await pool.query(
    "SELECT id, name, is_deleted FROM clients ORDER BY name ASC, id ASC",
  );
  const [projects] = await pool.query(
    "SELECT id, name, client_id, is_deleted FROM projects ORDER BY name ASC, id ASC",
  );
  return {
    schemaVersion: 1,
    about: ABOUT,
    clients: clients.map(rowToClient),
    projects: projects.map(rowToProject),
  };
}

async function resolveEntityId(rawId, table, entityLabel) {
  const pool = getPool();
  const trimmed =
    typeof rawId === "string" && rawId.trim() ? rawId.trim() : "";
  if (!trimmed) {
    return crypto.randomUUID();
  }
  if (!UUID_RE.test(trimmed)) {
    const e = new Error(`${entityLabel} id must be a valid UUID`);
    e.statusCode = 400;
    throw e;
  }
  const [rows] = await pool.query(
    `SELECT id FROM \`${table}\` WHERE id = ? LIMIT 1`,
    [trimmed],
  );
  if (rows.length) {
    const e = new Error(`${entityLabel} id already exists`);
    e.statusCode = 409;
    throw e;
  }
  return trimmed;
}

async function addClient(name, id) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    const e = new Error("Client name is required");
    e.statusCode = 400;
    throw e;
  }
  const clientId = await resolveEntityId(id, "clients", "Client");
  const pool = getPool();
  await pool.query(
    "INSERT INTO clients (id, name, is_deleted) VALUES (?, ?, 0)",
    [clientId, trimmed],
  );
  return { id: clientId, name: trimmed, isDeleted: false };
}

async function addProject(name, clientId, id) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    const e = new Error("Project name is required");
    e.statusCode = 400;
    throw e;
  }
  let linkedClientId = null;
  if (clientId !== undefined && clientId !== null && clientId !== "") {
    if (typeof clientId !== "string" || !UUID_RE.test(clientId.trim())) {
      const e = new Error("clientId must be a valid UUID");
      e.statusCode = 400;
      throw e;
    }
    linkedClientId = clientId.trim();
  }
  const pool = getPool();
  if (linkedClientId) {
    const [clients] = await pool.query(
      "SELECT id FROM clients WHERE id = ? AND is_deleted = 0 LIMIT 1",
      [linkedClientId],
    );
    if (!clients.length) {
      const e = new Error("Client not found");
      e.statusCode = 404;
      throw e;
    }
  }
  const projectId = await resolveEntityId(id, "projects", "Project");
  await pool.query(
    "INSERT INTO projects (id, name, client_id, is_deleted) VALUES (?, ?, ?, 0)",
    [projectId, trimmed, linkedClientId],
  );
  return {
    id: projectId,
    name: trimmed,
    clientId: linkedClientId,
    isDeleted: false,
  };
}

async function softDeleteClient(id) {
  const pool = getPool();
  const [clients] = await pool.query(
    "SELECT id, name, is_deleted FROM clients WHERE id = ? LIMIT 1",
    [id],
  );
  if (!clients.length) {
    const e = new Error("Client not found");
    e.statusCode = 404;
    throw e;
  }
  const [linked] = await pool.query(
    "SELECT COUNT(*) AS n FROM projects WHERE client_id = ? AND is_deleted = 0",
    [id],
  );
  const linkedCount = Number(linked[0].n) || 0;
  if (linkedCount > 0) {
    const e = new Error(
      `Cannot remove client while it has ${linkedCount} project(s). Remove the projects first.`,
    );
    e.statusCode = 400;
    throw e;
  }
  await pool.query("UPDATE clients SET is_deleted = 1 WHERE id = ?", [id]);
  return rowToClient({ ...clients[0], is_deleted: 1 });
}

async function softDeleteProject(id) {
  const pool = getPool();
  const [projects] = await pool.query(
    "SELECT id, name, client_id, is_deleted FROM projects WHERE id = ? LIMIT 1",
    [id],
  );
  if (!projects.length) {
    const e = new Error("Project not found");
    e.statusCode = 404;
    throw e;
  }
  await pool.query("UPDATE projects SET is_deleted = 1 WHERE id = ?", [id]);
  return rowToProject({ ...projects[0], is_deleted: 1 });
}

module.exports = {
  SAMPLE_PROJECT_ID,
  getCatalog,
  addClient,
  addProject,
  softDeleteClient,
  softDeleteProject,
};
