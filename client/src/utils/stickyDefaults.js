import {
  DEFAULT_CLIENT_KEY,
  DEFAULT_PROJECT_KEY,
} from "../constants/storageKeys.js";

function read(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function write(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function rememberStickyClientProject(clientId, projectId) {
  write(DEFAULT_CLIENT_KEY, clientId || "");
  write(DEFAULT_PROJECT_KEY, projectId || "");
}

/**
 * @param {Array<{id:string,isDeleted?:boolean}>} clients
 * @param {Array<{id:string,clientId?:string|null,isDeleted?:boolean}>} projects
 */
export function getStickyClientProject(clients, projects) {
  let clientId = read(DEFAULT_CLIENT_KEY);
  let projectId = read(DEFAULT_PROJECT_KEY);
  const activeClients = (clients || []).filter((c) => c && !c.isDeleted);
  const activeProjects = (projects || []).filter((p) => p && !p.isDeleted);

  if (!clientId && activeClients.length) clientId = activeClients[0].id;
  if (!projectId && activeProjects.length) {
    const forClient = clientId
      ? activeProjects.find((p) => !p.clientId || p.clientId === clientId)
      : null;
    projectId = (forClient || activeProjects[0]).id;
  }

  if (clientId && !activeClients.some((c) => c.id === clientId)) clientId = "";
  if (projectId && !activeProjects.some((p) => p.id === projectId)) {
    projectId = "";
  }

  if (clientId && projectId) {
    const proj = activeProjects.find((p) => p.id === projectId);
    if (proj && proj.clientId && proj.clientId !== clientId) {
      const match = activeProjects.find(
        (p) => !p.clientId || p.clientId === clientId,
      );
      projectId = match ? match.id : "";
    }
  }

  return { clientId, projectId };
}

/**
 * @param {object} day
 * @param {Array} clients
 * @param {Array} projects
 */
export function resolveDayClientProject(day, clients, projects) {
  const entries =
    day && Array.isArray(day.projectEntries) ? day.projectEntries : [];
  const first = entries[0];
  let clientId = day && day.clientId ? day.clientId : "";
  let projectId = first && first.projectId ? first.projectId : "";
  if (!clientId && first && first.clientId) clientId = first.clientId;
  if (!clientId && projectId) {
    const proj = (projects || []).find((p) => p && p.id === projectId);
    if (proj && proj.clientId) clientId = proj.clientId;
  }
  if (!clientId || !projectId) {
    const sticky = getStickyClientProject(clients, projects);
    if (!clientId) clientId = sticky.clientId;
    if (!projectId) projectId = sticky.projectId;
  }
  return { clientId, projectId };
}
