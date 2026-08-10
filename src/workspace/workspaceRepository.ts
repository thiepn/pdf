import { idbDelete, idbDeleteAllByIndex, idbGet, idbGetAllByIndex, idbPut } from "../storage/database";
import { exportProjectPackage, getProject, importProjectPackage } from "../projects/projectRepository";
import { WORKSPACE_SCHEMA_VERSION, type WorkspaceCheckpoint, type WorkspaceEvent, type WorkspaceMode, type WorkspaceSession, type WorkspaceTab } from "../types/workspace";
import { assertStorageBudget } from "../storage/budget";
import { assertReadableStateSchema } from "../projects/stateSchemaGuard";

const DEFAULT_SESSION: WorkspaceSession = {
  id: "primary",
  schemaVersion: WORKSPACE_SCHEMA_VERSION,
  tabs: [],
  recentlyClosed: [],
  timelineOpen: false,
  preservationOpen: false,
  updatedAt: Date.now()
};

function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeSession(value?: WorkspaceSession): WorkspaceSession {
  if (!value) return { ...DEFAULT_SESSION, tabs: [], recentlyClosed: [], updatedAt: Date.now() };
  assertReadableStateSchema(value.schemaVersion, WORKSPACE_SCHEMA_VERSION, "Workspace session");
  const uniqueTabs = Array.from(new Map((value.tabs ?? []).map((tab) => [tab.projectId, tab])).values());
  return {
    ...DEFAULT_SESSION,
    ...value,
    id: "primary",
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    tabs: uniqueTabs,
    recentlyClosed: (value.recentlyClosed ?? []).slice(0, 8),
    updatedAt: Date.now()
  };
}

export async function readWorkspaceSession(): Promise<WorkspaceSession> {
  return normalizeSession(await idbGet<WorkspaceSession>("workspaceSessions", "primary"));
}

export async function writeWorkspaceSession(session: WorkspaceSession): Promise<WorkspaceSession> {
  const normalized = normalizeSession(session);
  await idbPut("workspaceSessions", normalized);
  return normalized;
}

export async function activateWorkspaceProject(projectId: string, mode: WorkspaceMode): Promise<WorkspaceSession> {
  const session = await readWorkspaceSession();
  const now = Date.now();
  const existing = session.tabs.find((tab) => tab.projectId === projectId);
  const tab: WorkspaceTab = existing
    ? { ...existing, lastMode: mode, lastActivatedAt: now }
    : { projectId, pinned: false, lastMode: mode, openedAt: now, lastActivatedAt: now };
  const tabs = existing ? session.tabs.map((item) => item.projectId === projectId ? tab : item) : [...session.tabs, tab];
  const next = await writeWorkspaceSession({ ...session, activeProjectId: projectId, tabs });
  if (!existing) await appendWorkspaceEvent(projectId, "tab-opened", "Opened document tab", mode);
  return next;
}

export async function updateWorkspaceMode(projectId: string, mode: WorkspaceMode): Promise<WorkspaceSession> {
  const session = await activateWorkspaceProject(projectId, mode);
  await appendWorkspaceEvent(projectId, "mode-changed", `Switched to ${workspaceModeLabel(mode)}`, mode);
  return session;
}

export async function setTabPinned(projectId: string, pinned: boolean): Promise<WorkspaceSession> {
  const session = await readWorkspaceSession();
  return writeWorkspaceSession({ ...session, tabs: session.tabs.map((tab) => tab.projectId === projectId ? { ...tab, pinned } : tab) });
}

export async function closeWorkspaceTab(projectId: string): Promise<WorkspaceSession> {
  const session = await readWorkspaceSession();
  const tab = session.tabs.find((item) => item.projectId === projectId);
  if (!tab) return session;
  const tabs = session.tabs.filter((item) => item.projectId !== projectId);
  const recentlyClosed = [{ ...tab, closedAt: Date.now() }, ...session.recentlyClosed.filter((item) => item.projectId !== projectId)].slice(0, 8);
  const activeProjectId = session.activeProjectId === projectId ? tabs.at(-1)?.projectId : session.activeProjectId;
  await appendWorkspaceEvent(projectId, "tab-closed", "Closed document tab", tab.lastMode);
  return writeWorkspaceSession({ ...session, tabs, recentlyClosed, activeProjectId });
}

export async function restoreClosedWorkspaceTab(projectId?: string): Promise<WorkspaceSession> {
  const session = await readWorkspaceSession();
  const target = projectId ? session.recentlyClosed.find((item) => item.projectId === projectId) : session.recentlyClosed[0];
  if (!target) return session;
  const project = await getProject(target.projectId);
  if (!project) return writeWorkspaceSession({ ...session, recentlyClosed: session.recentlyClosed.filter((item) => item.projectId !== target.projectId) });
  const tab: WorkspaceTab = { projectId: target.projectId, pinned: target.pinned, lastMode: target.lastMode, openedAt: target.openedAt, lastActivatedAt: Date.now() };
  const tabs = session.tabs.some((item) => item.projectId === target.projectId) ? session.tabs : [...session.tabs, tab];
  await appendWorkspaceEvent(target.projectId, "tab-restored", "Restored closed document tab", target.lastMode);
  return writeWorkspaceSession({ ...session, tabs, activeProjectId: target.projectId, recentlyClosed: session.recentlyClosed.filter((item) => item.projectId !== target.projectId) });
}

export async function reorderWorkspaceTabs(projectIds: string[]): Promise<WorkspaceSession> {
  const session = await readWorkspaceSession();
  const byId = new Map(session.tabs.map((tab) => [tab.projectId, tab]));
  const ordered = projectIds.map((id) => byId.get(id)).filter((tab): tab is WorkspaceTab => Boolean(tab));
  const extras = session.tabs.filter((tab) => !projectIds.includes(tab.projectId));
  return writeWorkspaceSession({ ...session, tabs: [...ordered, ...extras] });
}

export async function setWorkspacePanelState(patch: Partial<Pick<WorkspaceSession, "timelineOpen" | "preservationOpen">>): Promise<WorkspaceSession> {
  const session = await readWorkspaceSession();
  return writeWorkspaceSession({ ...session, ...patch });
}

export async function appendWorkspaceEvent(projectId: string, type: WorkspaceEvent["type"], label: string, mode?: WorkspaceMode): Promise<void> {
  await idbPut<WorkspaceEvent>("workspaceEvents", { id: createId(), projectId, type, label, mode, createdAt: Date.now() });
}

export async function listWorkspaceEvents(projectId: string): Promise<WorkspaceEvent[]> {
  const events = await idbGetAllByIndex<WorkspaceEvent>("workspaceEvents", "projectId", projectId);
  return events.sort((left, right) => right.createdAt - left.createdAt).slice(0, 100);
}

export async function createWorkspaceCheckpoint(projectId: string, label: string): Promise<WorkspaceCheckpoint> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found.");
  const packageBlob = await exportProjectPackage(project);
  const packageBytes = await packageBlob.arrayBuffer();
  await assertStorageBudget(packageBytes.byteLength, "create this recovery checkpoint");
  const checkpoint: WorkspaceCheckpoint = {
    id: createId(),
    projectId,
    projectName: project.name,
    label: label.trim() || `Checkpoint ${new Date().toLocaleString()}`,
    createdAt: Date.now(),
    packageBytes,
    byteLength: packageBytes.byteLength
  };
  await idbPut("workspaceCheckpoints", checkpoint);
  await appendWorkspaceEvent(projectId, "checkpoint-created", `Created checkpoint: ${checkpoint.label}`);
  return checkpoint;
}

export async function listWorkspaceCheckpoints(projectId: string): Promise<WorkspaceCheckpoint[]> {
  const checkpoints = await idbGetAllByIndex<WorkspaceCheckpoint>("workspaceCheckpoints", "projectId", projectId);
  return checkpoints.sort((left, right) => right.createdAt - left.createdAt);
}

export async function deleteWorkspaceCheckpoint(checkpointId: string): Promise<void> {
  await idbDelete("workspaceCheckpoints", checkpointId);
}

export async function restoreWorkspaceCheckpoint(checkpoint: WorkspaceCheckpoint): Promise<string> {
  const file = new File([checkpoint.packageBytes.slice(0)], `${checkpoint.projectName}-${checkpoint.label}.lpsproject`, { type: "application/x-local-pdf-studio-project" });
  const restored = await importProjectPackage(file, undefined, {
    deduplicate: false,
    displayName: `${checkpoint.projectName} — ${checkpoint.label}`,
    origin: "checkpoint"
  });
  await appendWorkspaceEvent(restored.id, "checkpoint-restored", `Restored from checkpoint: ${checkpoint.label}`);
  await activateWorkspaceProject(restored.id, "viewer");
  return restored.id;
}

export async function deleteWorkspaceProjectData(projectId: string): Promise<void> {
  const session = await readWorkspaceSession();
  await Promise.allSettled([
    idbDeleteAllByIndex("workspaceEvents", "projectId", projectId),
    idbDeleteAllByIndex("workspaceCheckpoints", "projectId", projectId)
  ]);
  await writeWorkspaceSession({
    ...session,
    tabs: session.tabs.filter((tab) => tab.projectId !== projectId),
    recentlyClosed: session.recentlyClosed.filter((tab) => tab.projectId !== projectId),
    activeProjectId: session.activeProjectId === projectId ? undefined : session.activeProjectId
  });
}

export function workspaceModeLabel(mode: WorkspaceMode): string {
  const labels: Record<WorkspaceMode, string> = {
    viewer: "Read",
    editor: "Edit",
    organizer: "Pages",
    secure: "Forms & Protect",
    ocr: "OCR",
    compress: "Optimize",
    inspector: "Inspect",
    repair: "Repair",
    professional: "Print & Advanced",
    preservation: "Preservation",
    native: "Legacy native edit",
    compliance: "Accessibility",
    toolbox: "Tools"
  };
  return labels[mode];
}
