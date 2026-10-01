import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../common/Button.jsx";
import { catalogApi } from "../../api/client.js";

/**
 * Modal to manage clients and projects (hierarchy + create/remove).
 * @param {{
 *   open: boolean,
 *   clients: Array<{ id: string, name: string }>,
 *   projects: Array<{ id: string, name: string, clientId?: string|null }>,
 *   onClose: () => void,
 *   onChanged: () => void | Promise<void>,
 *   onStatus?: (msg: string, kind?: string) => void,
 * }} props
 */
export default function CreateCatalogDialog({
  open,
  clients = [],
  projects = [],
  onClose,
  onChanged,
  onStatus,
}) {
  const dialogRef = useRef(null);
  // browse | create-client | create-project
  const [step, setStep] = useState("browse");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState("");
  /** @type {[{ type: "client"|"project", item: object }|null, function]} */
  const [pendingRemove, setPendingRemove] = useState(null);

  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");

  const [projectName, setProjectName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectClientId, setProjectClientId] = useState("");

  const hierarchy = useMemo(() => {
    const byClient = clients.map((c) => ({
      client: c,
      projects: projects.filter((p) => p.clientId === c.id),
    }));
    const unassigned = projects.filter(
      (p) => !p.clientId || !clients.some((c) => c.id === p.clientId),
    );
    return { byClient, unassigned };
  }, [clients, projects]);

  function resetBrowse() {
    setStep("browse");
    setError("");
    setSaving(false);
    setRemovingId("");
    setPendingRemove(null);
    setClientName("");
    setClientId("");
    setProjectName("");
    setProjectId("");
    setProjectClientId(clients[0]?.id || "");
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      resetBrowse();
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!projectClientId && clients[0]?.id) {
      setProjectClientId(clients[0].id);
    }
  }, [open, clients, projectClientId]);

  function handleClose() {
    if (saving) return;
    onClose?.();
  }

  function openCreateClient() {
    setError("");
    setClientName("");
    setClientId("");
    setStep("create-client");
  }

  function openCreateProject(preferredClientId) {
    setError("");
    setProjectName("");
    setProjectId("");
    setProjectClientId(preferredClientId || clients[0]?.id || "");
    setStep("create-project");
  }

  async function handleCreateClient(ev) {
    ev.preventDefault();
    const name = clientName.trim();
    if (!name) {
      setError("Client name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = { name };
      if (clientId.trim()) body.id = clientId.trim();
      const item = await catalogApi.createClient(body);
      onStatus?.(`Client “${item.name}” created.`, "ok");
      await onChanged?.();
      resetBrowse();
    } catch (e) {
      setError(e.message || "Failed to create client");
      onStatus?.(e.message, "err");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateProject(ev) {
    ev.preventDefault();
    const name = projectName.trim();
    if (!name) {
      setError("Project name is required.");
      return;
    }
    if (!projectClientId) {
      setError("Select a client for this project.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name,
        clientId: projectClientId,
      };
      if (projectId.trim()) body.id = projectId.trim();
      const item = await catalogApi.createProject(body);
      onStatus?.(`Project “${item.name}” created.`, "ok");
      await onChanged?.();
      resetBrowse();
    } catch (e) {
      setError(e.message || "Failed to create project");
      onStatus?.(e.message, "err");
    } finally {
      setSaving(false);
    }
  }

  function askRemoveClient(client) {
    if (!client?.id || saving) return;
    const linkedCount = projects.filter((p) => p.clientId === client.id).length;
    if (linkedCount > 0) {
      setError(
        `Cannot remove “${client.name}” while it has ${linkedCount} project${linkedCount === 1 ? "" : "s"}. Remove the projects first.`,
      );
      return;
    }
    setError("");
    setPendingRemove({ type: "client", item: client });
    setStep("confirm-remove");
  }

  function askRemoveProject(project) {
    if (!project?.id || saving) return;
    setError("");
    setPendingRemove({ type: "project", item: project });
    setStep("confirm-remove");
  }

  async function handleConfirmRemove() {
    if (!pendingRemove || saving) return;
    const { type, item } = pendingRemove;
    setSaving(true);
    setRemovingId(item.id);
    setError("");
    try {
      if (type === "client") {
        await catalogApi.deleteClient(item.id);
        onStatus?.(`Client “${item.name}” removed.`, "ok");
      } else {
        await catalogApi.deleteProject(item.id);
        onStatus?.(`Project “${item.name}” removed.`, "ok");
      }
      await onChanged?.();
      resetBrowse();
    } catch (e) {
      setError(e.message || "Failed to remove");
      onStatus?.(e.message, "err");
    } finally {
      setSaving(false);
      setRemovingId("");
    }
  }

  const title =
    step === "create-client"
      ? "Create client"
      : step === "create-project"
        ? "Create project"
        : step === "confirm-remove"
          ? pendingRemove?.type === "client"
            ? "Remove client"
            : "Remove project"
          : "Clients & projects";

  return (
    <dialog
      ref={dialogRef}
      className="catalog-create-dialog catalog-create-dialog--wide"
      onClose={handleClose}
      onCancel={(ev) => {
        if (saving) {
          ev.preventDefault();
          return;
        }
        handleClose();
      }}
    >
      <div className="catalog-create-dialog__body">
        <div className="catalog-create-dialog__header">
          <h2 className="catalog-create-dialog__title">{title}</h2>
          {step === "browse" && (
            <div className="catalog-create-dialog__header-actions">
              <Button
                type="button"
                size="sm"
                onClick={openCreateClient}
                disabled={saving}
              >
                Create client
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => openCreateProject()}
                disabled={saving || !clients.length}
                title={
                  clients.length
                    ? "Create a project under a client"
                    : "Create a client first"
                }
              >
                Create project
              </Button>
            </div>
          )}
        </div>

        {step === "browse" && (
          <>
            <p className="catalog-create-dialog__copy">
              Clients with their projects. Remove items from the list, or use
              the header buttons to create new ones.
            </p>

            <div className="catalog-hierarchy holiday-import-scroll">
              {hierarchy.byClient.length === 0 &&
              hierarchy.unassigned.length === 0 ? (
                <p className="catalog-create-dialog__hint">
                  No clients or projects yet. Create a client to get started.
                </p>
              ) : (
                <>
                  {hierarchy.byClient.map(({ client, projects: childProjects }) => (
                    <section
                      key={client.id}
                      className="catalog-hierarchy__client"
                    >
                      <div className="catalog-hierarchy__client-row">
                        <div className="catalog-hierarchy__client-info">
                          <span className="catalog-hierarchy__client-name">
                            {client.name}
                          </span>
                          <span className="catalog-hierarchy__meta">
                            {childProjects.length} project
                            {childProjects.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="catalog-hierarchy__row-actions">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => openCreateProject(client.id)}
                            disabled={saving}
                            title={`Add project under ${client.name}`}
                          >
                            Add project
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="catalog-create-btn--danger"
                            onClick={() => askRemoveClient(client)}
                            disabled={saving || childProjects.length > 0}
                            title={
                              childProjects.length > 0
                                ? "Remove all projects under this client first"
                                : `Remove ${client.name}`
                            }
                          >
                            {removingId === client.id
                              ? "Removing…"
                              : "Remove"}
                          </Button>
                        </div>
                      </div>
                      {childProjects.length > 0 ? (
                        <ul className="catalog-hierarchy__projects">
                          {childProjects.map((p) => (
                            <li
                              key={p.id}
                              className="catalog-hierarchy__project-row"
                            >
                              <span className="catalog-hierarchy__project-name">
                                {p.name}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                className="catalog-create-btn--danger"
                                onClick={() => askRemoveProject(p)}
                                disabled={saving}
                              >
                                {removingId === p.id
                                  ? "Removing…"
                                  : "Remove"}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="catalog-hierarchy__empty">
                          No projects under this client.
                        </p>
                      )}
                    </section>
                  ))}

                  {hierarchy.unassigned.length > 0 && (
                    <section className="catalog-hierarchy__client">
                      <div className="catalog-hierarchy__client-row">
                        <div className="catalog-hierarchy__client-info">
                          <span className="catalog-hierarchy__client-name">
                            Unassigned projects
                          </span>
                          <span className="catalog-hierarchy__meta">
                            {hierarchy.unassigned.length}
                          </span>
                        </div>
                      </div>
                      <ul className="catalog-hierarchy__projects">
                        {hierarchy.unassigned.map((p) => (
                          <li
                            key={p.id}
                            className="catalog-hierarchy__project-row"
                          >
                            <span className="catalog-hierarchy__project-name">
                              {p.name}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              className="catalog-create-btn--danger"
                              onClick={() => askRemoveProject(p)}
                              disabled={saving}
                            >
                              {removingId === p.id ? "Removing…" : "Remove"}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </>
              )}
            </div>

            {error && (
              <p className="catalog-create-dialog__error" role="alert">
                {error}
              </p>
            )}

            <div className="catalog-create-dialog__actions">
              <Button type="button" size="sm" onClick={handleClose} disabled={saving}>
                Close
              </Button>
            </div>
          </>
        )}

        {step === "confirm-remove" && pendingRemove && (
          <div className="catalog-create-dialog__form">
            <div className="catalog-confirm-card">
              <p className="catalog-confirm-card__lead">
                {pendingRemove.type === "client" ? (
                  <>
                    Remove client{" "}
                    <strong>“{pendingRemove.item.name}”</strong>?
                  </>
                ) : (
                  <>
                    Remove project{" "}
                    <strong>“{pendingRemove.item.name}”</strong>?
                  </>
                )}
              </p>
              <p className="catalog-create-dialog__copy">
                {pendingRemove.type === "client"
                  ? "This client has no projects, so it can be removed safely."
                  : "It will no longer appear in project dropdowns."}
              </p>
              <p className="catalog-confirm-card__note">
                This is a soft delete — you can restore it later from the data
                file if needed.
              </p>
            </div>
            {error && (
              <p className="catalog-create-dialog__error" role="alert">
                {error}
              </p>
            )}
            <div className="catalog-create-dialog__actions">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setPendingRemove(null);
                  setError("");
                  setStep("browse");
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="catalog-create-btn--danger"
                onClick={handleConfirmRemove}
                disabled={saving}
              >
                {saving
                  ? "Removing…"
                  : pendingRemove.type === "client"
                    ? "Remove client"
                    : "Remove project"}
              </Button>
            </div>
          </div>
        )}

        {step === "create-client" && (
          <form
            className="catalog-create-dialog__form"
            onSubmit={handleCreateClient}
          >
            <p className="catalog-create-dialog__copy">
              Leave ID empty to auto-generate a UUID.
            </p>
            <label className="catalog-create-dialog__field">
              <span>Client name</span>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Acme Corp"
                autoFocus
                required
                disabled={saving}
              />
            </label>
            <label className="catalog-create-dialog__field">
              <span>Client ID (optional)</span>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="UUID — leave blank to auto-generate"
                spellCheck={false}
                autoComplete="off"
                disabled={saving}
              />
            </label>
            {error && (
              <p className="catalog-create-dialog__error" role="alert">
                {error}
              </p>
            )}
            <div className="catalog-create-dialog__actions">
              <Button
                type="button"
                size="sm"
                onClick={resetBrowse}
                disabled={saving}
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={saving || !clientName.trim()}
              >
                {saving ? "Creating…" : "Create client"}
              </Button>
            </div>
          </form>
        )}

        {step === "create-project" && (
          <form
            className="catalog-create-dialog__form"
            onSubmit={handleCreateProject}
          >
            <p className="catalog-create-dialog__copy">
              Choose a client, then enter the project name. Leave ID empty to
              auto-generate a UUID.
            </p>
            <label className="catalog-create-dialog__field">
              <span>Client</span>
              <select
                value={projectClientId}
                onChange={(e) => setProjectClientId(e.target.value)}
                required
                disabled={saving || !clients.length}
              >
                {!clients.length && <option value="">No clients</option>}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="catalog-create-dialog__field">
              <span>Project name</span>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Digital Twin"
                autoFocus
                required
                disabled={saving}
              />
            </label>
            <label className="catalog-create-dialog__field">
              <span>Project ID (optional)</span>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="UUID — leave blank to auto-generate"
                spellCheck={false}
                autoComplete="off"
                disabled={saving}
              />
            </label>
            {error && (
              <p className="catalog-create-dialog__error" role="alert">
                {error}
              </p>
            )}
            <div className="catalog-create-dialog__actions">
              <Button
                type="button"
                size="sm"
                onClick={resetBrowse}
                disabled={saving}
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={saving || !projectName.trim() || !projectClientId}
              >
                {saving ? "Creating…" : "Create project"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
