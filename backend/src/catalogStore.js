const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.CALENDAR_DATA_DIR
  ? path.resolve(process.env.CALENDAR_DATA_DIR)
  : path.join(__dirname, "..", "data");

const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");
const SAMPLE_PROJECT_ID = "f9c556ac-2940-4bf1-9315-05799a732109";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let writeChain = Promise.resolve();

function serializeWrite(fn) {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => {});
  return next;
}

function emptyDocument() {
  return {
    schemaVersion: 1,
    about:
      "Clients and projects master data. Soft-delete with isDeleted. Sample projectId from API payload is seeded.",
    clients: [
      {
        id: SAMPLE_PROJECT_ID,
        name: "Default Client",
        isDeleted: false,
      },
    ],
    projects: [
      {
        id: SAMPLE_PROJECT_ID,
        name: "Default Project",
        clientId: SAMPLE_PROJECT_ID,
        isDeleted: false,
      },
    ],
  };
}

async function readDocument() {
  try {
    const raw = await fs.readFile(CATALOG_FILE, "utf8");
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== "object") return emptyDocument();
    if (!Array.isArray(doc.clients)) doc.clients = [];
    if (!Array.isArray(doc.projects)) doc.projects = [];
    return doc;
  } catch (err) {
    if (err.code === "ENOENT") {
      const doc = emptyDocument();
      await writeDocument(doc);
      return doc;
    }
    throw err;
  }
}

async function writeDocument(doc) {
  const tmp = `${CATALOG_FILE}.${process.pid}.tmp`;
  const content = `${JSON.stringify(doc, null, 2)}\n`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, CATALOG_FILE);
}

function normalizeClient(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!id || !UUID_RE.test(id) || !name) return null;
  return { id, name, isDeleted: Boolean(raw.isDeleted) };
}

function normalizeProject(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const clientId =
    typeof raw.clientId === "string" && raw.clientId.trim()
      ? raw.clientId.trim()
      : null;
  if (!id || !UUID_RE.test(id) || !name) return null;
  if (clientId && !UUID_RE.test(clientId)) return null;
  return {
    id,
    name,
    clientId,
    isDeleted: Boolean(raw.isDeleted),
  };
}

async function getCatalog() {
  const doc = await readDocument();
  return {
    schemaVersion: doc.schemaVersion || 1,
    about: doc.about || emptyDocument().about,
    clients: doc.clients.map(normalizeClient).filter(Boolean),
    projects: doc.projects.map(normalizeProject).filter(Boolean),
  };
}

/**
 * Resolve optional id: use provided UUID or auto-generate.
 * @param {unknown} rawId
 * @param {Array<{ id?: string }>} existing
 * @param {string} entityLabel
 * @returns {string}
 */
function resolveEntityId(rawId, existing, entityLabel) {
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
  if (existing.some((item) => item && item.id === trimmed)) {
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
  return serializeWrite(async () => {
    const doc = await readDocument();
    const client = {
      id: resolveEntityId(id, doc.clients, "Client"),
      name: trimmed,
      isDeleted: false,
    };
    doc.clients.push(client);
    await writeDocument(doc);
    return client;
  });
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
  return serializeWrite(async () => {
    const doc = await readDocument();
    if (linkedClientId) {
      const client = doc.clients.find(
        (c) => c && c.id === linkedClientId && !c.isDeleted,
      );
      if (!client) {
        const e = new Error("Client not found");
        e.statusCode = 404;
        throw e;
      }
    }
    const project = {
      id: resolveEntityId(id, doc.projects, "Project"),
      name: trimmed,
      clientId: linkedClientId,
      isDeleted: false,
    };
    doc.projects.push(project);
    await writeDocument(doc);
    return project;
  });
}

async function softDeleteClient(id) {
  return serializeWrite(async () => {
    const doc = await readDocument();
    const client = doc.clients.find((c) => c && c.id === id);
    if (!client) {
      const e = new Error("Client not found");
      e.statusCode = 404;
      throw e;
    }
    const linkedProjects = doc.projects.filter(
      (p) => p && p.clientId === id && p.isDeleted !== true,
    );
    if (linkedProjects.length > 0) {
      const e = new Error(
        `Cannot remove client while it has ${linkedProjects.length} project(s). Remove the projects first.`,
      );
      e.statusCode = 400;
      throw e;
    }
    client.isDeleted = true;
    await writeDocument(doc);
    return normalizeClient(client);
  });
}

async function softDeleteProject(id) {
  return serializeWrite(async () => {
    const doc = await readDocument();
    const project = doc.projects.find((p) => p && p.id === id);
    if (!project) {
      const e = new Error("Project not found");
      e.statusCode = 404;
      throw e;
    }
    project.isDeleted = true;
    await writeDocument(doc);
    return normalizeProject(project);
  });
}

module.exports = {
  CATALOG_FILE,
  SAMPLE_PROJECT_ID,
  getCatalog,
  addClient,
  addProject,
  softDeleteClient,
  softDeleteProject,
};
