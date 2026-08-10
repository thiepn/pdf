import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { navigateTo, routeHref } from "../core/appRouter";
import { getProject } from "../projects/projectRepository";
import { createProjectLease, type ProjectLease, type ProjectLeaseMode } from "../projects/projectLease";
import { readSettings, SETTINGS_CHANGED_EVENT, writeSettings } from "../settings/settingsStore";
import type { ProjectManifest } from "../types/project";
import type { AppSettings } from "../types/settings";
import type { WorkspaceCheckpoint, WorkspaceEvent, WorkspaceMode, WorkspaceSession } from "../types/workspace";
import type { DocumentRevision, DocumentTransaction } from "../types/revision";
import { listDocumentLineage, listDocumentTransactions, reconcileInterruptedTransactions } from "../revisions/revisionRepository";
import { CompressionPage } from "../views/CompressionPage";
import { EditorPage } from "../views/EditorPage";
import { InspectorPage } from "../views/InspectorPage";
import { OcrPage } from "../views/OcrPage";
import { OrganizerPage } from "../views/OrganizerPage";
import { ProfessionalPage } from "../views/ProfessionalPage";
import { PreservationPage } from "../views/PreservationPage";
import { NativeEditorPage } from "../views/NativeEditorPage";
import { CompliancePage } from "../views/CompliancePage";
import { RepairPage } from "../views/RepairPage";
import { SecurePage } from "../views/SecurePage";
import { ViewerPage } from "../views/ViewerPage";
import { ToolboxPage } from "../views/ToolboxPage";
import { useModalFocus } from "../accessibility/modalFocus";
import { getPreservationContract } from "./preservationContracts";
import { beginWorkspaceHeartbeat, readInterruptedWorkspaceSession, type InterruptedWorkspaceSession } from "../recovery/sessionHeartbeat";
import { cancelProjectOperation, runProjectOperation, subscribeProjectOperation, type ProjectOperationSnapshot } from "../operations/projectOperationCoordinator";
import {
  activateWorkspaceProject,
  closeWorkspaceTab,
  createWorkspaceCheckpoint,
  deleteWorkspaceCheckpoint,
  listWorkspaceCheckpoints,
  listWorkspaceEvents,
  readWorkspaceSession,
  reorderWorkspaceTabs,
  restoreClosedWorkspaceTab,
  restoreWorkspaceCheckpoint,
  setTabPinned,
  setWorkspacePanelState,
  updateWorkspaceMode,
  workspaceModeLabel
} from "./workspaceRepository";

interface UnifiedWorkspaceProps {
  projectId: string;
  mode: WorkspaceMode;
  onTitleChange?: (title: string, subtitle?: string) => void;
}

const allModes: WorkspaceMode[] = ["viewer", "editor", "organizer", "toolbox", "compress", "secure", "ocr", "compliance", "professional"];
const simpleModes: WorkspaceMode[] = ["viewer", "editor", "organizer", "toolbox", "compress", "secure", "ocr"];
const technicalModes: WorkspaceMode[] = ["inspector", "repair", "preservation"];

export function UnifiedWorkspace({ projectId, mode, onTitleChange }: UnifiedWorkspaceProps) {
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [projects, setProjects] = useState<Record<string, ProjectManifest>>({});
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => readSettings());
  const [events, setEvents] = useState<WorkspaceEvent[]>([]);
  const [checkpoints, setCheckpoints] = useState<WorkspaceCheckpoint[]>([]);
  const [transactions, setTransactions] = useState<DocumentTransaction[]>([]);
  const [revisions, setRevisions] = useState<DocumentRevision[]>([]);
  const [checkpointLabel, setCheckpointLabel] = useState("");
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [childSubtitle, setChildSubtitle] = useState<string | undefined>();
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [leaseMode, setLeaseMode] = useState<ProjectLeaseMode>("read-only");
  const [leaseHandle, setLeaseHandle] = useState<ProjectLease | null>(null);
  const [interruptedSession, setInterruptedSession] = useState<InterruptedWorkspaceSession | null>(() => readInterruptedWorkspaceSession(projectId));
  const [activeOperation, setActiveOperation] = useState<ProjectOperationSnapshot | null>(null);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const mobileSheetRef = useRef<HTMLElement | null>(null);
  const closeMobileTools = useCallback(() => setMobileToolsOpen(false), []);
  useModalFocus(mobileToolsOpen, mobileSheetRef, closeMobileTools);

  const refreshTimeline = useCallback(async () => {
    const manifest = await getProject(projectId);
    const rootProjectId = manifest?.lineage?.rootProjectId ?? projectId;
    const [nextEvents, nextCheckpoints, nextTransactions, nextRevisions] = await Promise.all([
      listWorkspaceEvents(projectId),
      listWorkspaceCheckpoints(projectId),
      listDocumentTransactions(projectId),
      listDocumentLineage(rootProjectId)
    ]);
    setEvents(nextEvents);
    setCheckpoints(nextCheckpoints);
    setTransactions(nextTransactions);
    setRevisions(nextRevisions);
  }, [projectId]);

  const refreshSession = useCallback(async () => {
    const next = await readWorkspaceSession();
    setSession(next);
    const manifests = await Promise.all(next.tabs.map((tab) => getProject(tab.projectId)));
    const map: Record<string, ProjectManifest> = {};
    for (const manifest of manifests) if (manifest) map[manifest.id] = manifest;
    setProjects(map);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setError(null);
    setChildSubtitle(undefined);
    void (async () => {
      try {
        const manifest = await getProject(projectId);
        if (!manifest) throw new Error("Project not found. It may have been deleted or browser storage may have been cleared.");
        const nextSession = await activateWorkspaceProject(projectId, mode);
        if (cancelled) return;
        setProject(manifest);
        setSession(nextSession);
        await Promise.all([refreshSession(), refreshTimeline()]);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      }
    })();
    return () => { cancelled = true; };
  }, [mode, projectId, refreshSession, refreshTimeline]);


  useEffect(() => {
    setInterruptedSession(readInterruptedWorkspaceSession(projectId));
    return beginWorkspaceHeartbeat(projectId, mode);
  }, [mode, projectId]);

  useEffect(() => subscribeProjectOperation(projectId, setActiveOperation), [projectId]);

  useEffect(() => {
    if (!activeOperation) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [activeOperation]);

  useEffect(() => {
    const listener = (event: Event) => setSettings((event as CustomEvent<AppSettings>).detail ?? readSettings());
    window.addEventListener(SETTINGS_CHANGED_EVENT, listener);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, listener);
  }, []);

  useEffect(() => {
    const lease = createProjectLease(projectId);
    setLeaseHandle(lease);
    const unsubscribe = lease.subscribe(setLeaseMode);
    const release = () => lease.release();
    window.addEventListener("pagehide", release, { once: true });
    return () => {
      window.removeEventListener("pagehide", release);
      unsubscribe();
      lease.release();
      setLeaseHandle(null);
    };
  }, [projectId]);

  useEffect(() => {
    if (leaseMode !== "owner") return;
    let cancelled = false;
    void (async () => {
      const recovered = await reconcileInterruptedTransactions(projectId);
      if (!cancelled && recovered.length) await refreshTimeline();
    })().catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [leaseMode, projectId, refreshTimeline]);

  useEffect(() => {
    if (!project) return;
    onTitleChange?.(project.name, childSubtitle ?? `${project.summary.pageCount} pages · Unified workspace`);
  }, [childSubtitle, onTitleChange, project]);

  const contract = useMemo(() => getPreservationContract(mode), [mode]);
  const availableModes = settings.experienceMode === "advanced" ? allModes : simpleModes;
  const contextActions = useMemo(() => buildContextActions(project), [project]);
  const modeRequiresOwnership = !["viewer", "inspector"].includes(mode);
  const workspaceLocked = leaseMode !== "owner" && modeRequiresOwnership;

  async function switchMode(nextMode: WorkspaceMode): Promise<void> {
    closeMobileTools();
    if (nextMode === mode) return;
    if (activeOperation) { setError(`Finish or cancel “${activeOperation.label}” before switching tools.`); return; }
    await updateWorkspaceMode(projectId, nextMode);
    navigateTo({ name: "workspace", projectId, mode: nextMode });
  }

  async function activateTab(targetProjectId: string): Promise<void> {
    const tab = session?.tabs.find((item) => item.projectId === targetProjectId);
    navigateTo({ name: "workspace", projectId: targetProjectId, mode: tab?.lastMode ?? "viewer" });
  }

  function handleTabKeyDown(event: import("react").KeyboardEvent<HTMLButtonElement>, targetProjectId: string): void {
    if (!session || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = session.tabs.findIndex((tab) => tab.projectId === targetProjectId);
    if (index < 0) return;
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? session.tabs.length - 1
        : event.key === "ArrowLeft" ? (index - 1 + session.tabs.length) % session.tabs.length
          : (index + 1) % session.tabs.length;
    const next = session.tabs[nextIndex];
    if (next) void activateTab(next.projectId);
  }

  async function closeTab(targetProjectId: string): Promise<void> {
    if (targetProjectId === projectId && activeOperation) { setError(`Finish or cancel “${activeOperation.label}” before closing this document.`); return; }
    const next = await closeWorkspaceTab(targetProjectId);
    setSession(next);
    if (targetProjectId !== projectId) {
      await refreshSession();
      return;
    }
    const nextId = next.activeProjectId ?? next.tabs.at(-1)?.projectId;
    if (!nextId) {
      navigateTo({ name: "projects" });
      return;
    }
    const nextTab = next.tabs.find((item) => item.projectId === nextId);
    navigateTo({ name: "workspace", projectId: nextId, mode: nextTab?.lastMode ?? "viewer" });
  }

  async function restoreClosed(): Promise<void> {
    const next = await restoreClosedWorkspaceTab();
    setSession(next);
    const restoredId = next.activeProjectId;
    if (!restoredId) return;
    const tab = next.tabs.find((item) => item.projectId === restoredId);
    navigateTo({ name: "workspace", projectId: restoredId, mode: tab?.lastMode ?? "viewer" });
  }

  async function togglePin(targetProjectId: string): Promise<void> {
    const tab = session?.tabs.find((item) => item.projectId === targetProjectId);
    if (!tab) return;
    setSession(await setTabPinned(targetProjectId, !tab.pinned));
  }

  async function dropTab(targetProjectId: string): Promise<void> {
    if (!draggedProjectId || draggedProjectId === targetProjectId || !session) return;
    const ids = session.tabs.map((tab) => tab.projectId);
    const from = ids.indexOf(draggedProjectId);
    const to = ids.indexOf(targetProjectId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, draggedProjectId);
    setSession(await reorderWorkspaceTabs(ids));
    setDraggedProjectId(null);
  }

  async function createCheckpoint(): Promise<void> {
    if (!project) return;
    setCheckpointBusy(true);
    setError(null);
    try {
      await runProjectOperation(projectId, { label: "Creating recovery checkpoint", cancellable: false, reserveBytes: project.byteLength, storagePurpose: "create the recovery checkpoint" }, async ({ update }) => {
        update({ detail: "Packaging project state locally…", progress: 0.2 });
        await createWorkspaceCheckpoint(projectId, checkpointLabel);
        update({ progress: 1 });
      });
      setCheckpointLabel("");
      await refreshTimeline();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setCheckpointBusy(false);
    }
  }

  async function restoreCheckpoint(checkpoint: WorkspaceCheckpoint): Promise<void> {
    if (!window.confirm(`Restore “${checkpoint.label}” as a new local project? The current project will remain unchanged.`)) return;
    setCheckpointBusy(true);
    setError(null);
    try {
      const restoredId = await restoreWorkspaceCheckpoint(checkpoint);
      navigateTo({ name: "workspace", projectId: restoredId, mode: "viewer" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setCheckpointBusy(false);
    }
  }

  async function removeCheckpoint(checkpointId: string): Promise<void> {
    await deleteWorkspaceCheckpoint(checkpointId);
    await refreshTimeline();
  }

  function setExperienceMode(experienceMode: AppSettings["experienceMode"]): void {
    const next = { ...settings, experienceMode };
    try {
      writeSettings(next);
      setSettings(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function togglePanel(panel: "timelineOpen" | "preservationOpen"): Promise<void> {
    if (!session) return;
    const opening = !session[panel];
    const next = await setWorkspacePanelState(panel === "timelineOpen"
      ? { timelineOpen: opening, preservationOpen: opening ? false : session.preservationOpen }
      : { preservationOpen: opening, timelineOpen: opening ? false : session.timelineOpen });
    setSession(next);
  }

  async function retryOwnership(): Promise<void> {
    if (!leaseHandle) return;
    const acquired = await leaseHandle.tryAcquire();
    if (!acquired) setError("This project is still open for editing in another tab. Close that tab or leave it on this read-only workspace.");
  }

  if (error && !project) return <div className="workspace-fatal"><strong>Workspace unavailable</strong><p>{error}</p><a className="button" href={routeHref({ name: "projects" })}>Open projects</a></div>;
  if (!project || !session) return <div className="viewer-loading"><span className="spinner" /><strong>Opening unified workspace…</strong></div>;

  return <div className="unified-workspace">
    <div className="workspace-tabs" role="tablist" aria-label="Open PDF documents">
      <div className="workspace-tabs__scroll">
        {session.tabs.map((tab) => {
          const manifest = projects[tab.projectId] ?? (tab.projectId === project.id ? project : undefined);
          return <div
            className={tab.projectId === projectId ? "workspace-tab workspace-tab--active" : "workspace-tab"}
            draggable
            key={tab.projectId}
            onDragOver={(event) => event.preventDefault()}
            onDragStart={() => setDraggedProjectId(tab.projectId)}
            onDrop={() => void dropTab(tab.projectId)}
            role="presentation"
          >
            <button aria-controls="workspace-document-panel" aria-selected={tab.projectId === projectId} className="workspace-tab__main" id={`workspace-tab-${tab.projectId}`} onClick={() => void activateTab(tab.projectId)} onKeyDown={(event) => handleTabKeyDown(event, tab.projectId)} role="tab" tabIndex={tab.projectId === projectId ? 0 : -1} type="button">
              <span className="workspace-tab__document" aria-hidden="true">PDF</span>
              <span><strong>{manifest?.name ?? "Unavailable project"}</strong><small>{workspaceModeLabel(tab.lastMode)}</small></span>
              {manifest?.recovery.dirty ? <i title="Local edits">●</i> : null}
            </button>
            <button aria-label={tab.pinned ? "Unpin tab" : "Pin tab"} className={tab.pinned ? "workspace-tab__icon workspace-tab__icon--active" : "workspace-tab__icon"} onClick={() => void togglePin(tab.projectId)} title={tab.pinned ? "Unpin" : "Pin"} type="button">⌖</button>
            {!tab.pinned ? <button aria-label={`Close ${manifest?.name ?? "tab"}`} className="workspace-tab__icon" onClick={() => void closeTab(tab.projectId)} title="Close tab" type="button">×</button> : null}
          </div>;
        })}
      </div>
      <div className="workspace-tabs__actions">
        {session.recentlyClosed.length ? <button aria-label="Restore last closed tab" className="icon-button" onClick={() => void restoreClosed()} title="Restore last closed tab" type="button">↶</button> : null}
        <a aria-label="Open another project" className="icon-button" href={routeHref({ name: "projects" })} title="Open another project">＋</a>
      </div>
    </div>

    <header className="workspace-commandbar">
      <div className="workspace-commandbar__identity">
        <div><p className="eyebrow">{settings.experienceMode === "simple" ? "Simple workspace" : "Advanced workspace"}</p><h1 id="workspace-document-title">{project.name}</h1></div>
        <div className="workspace-document-facts">
          <span>{project.summary.pageCount} pages</span>
          <span>{formatBytes(project.byteLength)}</span>
          {project.summary.encrypted ? <span className="warning-chip">Protected</span> : null}
          {leaseMode === "owner" ? <span className="workspace-lease-chip">Editing</span> : <span className="warning-chip">Read only</span>}
          {project.summary.formFieldCount ? <span>{project.summary.formFieldCount} form fields</span> : null}
        </div>
      </div>
      <div className="workspace-commandbar__actions">
        <a className="button button--secondary button--small" href={routeHref({ name: "batch" })}>Batch automation</a>
        <div className="segmented-control" aria-label="Workspace tools">
          <button aria-pressed={settings.experienceMode === "simple"} className={settings.experienceMode === "simple" ? "active" : ""} onClick={() => setExperienceMode("simple")} type="button">Simple</button>
          <button aria-pressed={settings.experienceMode === "advanced"} className={settings.experienceMode === "advanced" ? "active" : ""} onClick={() => setExperienceMode("advanced")} type="button">Advanced</button>
        </div>
        {settings.experienceMode === "advanced" && settings.showPreservationWarnings ? <button className={session.preservationOpen ? "button button--secondary button--small active" : "button button--secondary button--small"} onClick={() => void togglePanel("preservationOpen")} type="button">What changes?</button> : null}
        <button className={session.timelineOpen ? "button button--secondary button--small active" : "button button--secondary button--small"} onClick={() => void togglePanel("timelineOpen")} type="button">History</button>
      </div>
    </header>

    <nav className="workspace-modes" aria-label="Document workspace modes">
      {availableModes.map((item) => <button aria-current={item === mode ? "page" : undefined} className={item === mode ? "workspace-mode workspace-mode--active" : "workspace-mode"} key={item} onClick={() => void switchMode(item)} type="button"><ModeIcon mode={item} /><span>{workspaceModeLabel(item)}</span></button>)}
      {settings.experienceMode === "simple" ? <button className="workspace-mode workspace-mode--more" onClick={() => setExperienceMode("advanced")} type="button"><span aria-hidden="true">•••</span><span>More tools</span></button> : null}
    </nav>
    {settings.experienceMode === "advanced" ? <div className="workspace-technical-tools"><span>Advanced diagnostics</span>{technicalModes.map((item) => <button className={item === mode ? "active" : ""} key={item} onClick={() => void switchMode(item)} type="button"><ModeIcon mode={item}/>{workspaceModeLabel(item)}</button>)}</div> : null}

    {contextActions.length ? <div className="workspace-contextbar"><strong>Suggested next step</strong>{contextActions.map((action) => <button key={action.mode} onClick={() => void switchMode(action.mode)} type="button">{action.label}</button>)}</div> : null}
    {error ? <div aria-live="assertive" className="error-banner" role="alert"><strong>Workspace action failed</strong><span>{error}</span><button onClick={() => setError(null)} type="button">Dismiss</button></div> : null}
    {interruptedSession ? <div aria-live="polite" className="warning-banner workspace-recovery-banner" role="status"><strong>Recovered after an interrupted session</strong><span>The previous workspace heartbeat ended without a clean close. Source PDF bytes were never edited in place; any interrupted document transaction is reconciled before this tab can write.</span><button className="button button--small button--secondary" onClick={() => setInterruptedSession(null)} type="button">Dismiss</button></div> : null}
    {activeOperation ? <div className="workspace-operation-banner" role="status" aria-live="polite"><div><strong>{activeOperation.label}</strong><span>{activeOperation.detail ?? operationStageLabel(activeOperation.stage)}</span>{activeOperation.progress !== undefined ? <progress max="1" value={activeOperation.progress} /> : null}</div><div><small>{formatElapsed(Date.now() - activeOperation.startedAt)}</small>{activeOperation.cancellable ? <button className="button button--small button--secondary" onClick={() => cancelProjectOperation(projectId)} type="button">Cancel</button> : null}</div></div> : null}
    {leaseMode !== "owner" ? <div className="warning-banner workspace-readonly-banner" role="status"><strong>Read-only in this tab</strong><span>This project is being edited in another tab. You can still read it here, but editing is disabled to prevent conflicting changes.</span><button className="button button--small button--secondary" onClick={() => void retryOwnership()} type="button">Try editing here</button></div> : null}

    <div className={session.timelineOpen || (session.preservationOpen && settings.showPreservationWarnings) ? "workspace-body workspace-body--panel" : "workspace-body"}>
      <main aria-labelledby="workspace-document-title" className="workspace-mode-content" id="workspace-document-panel" role="tabpanel">
        {workspaceLocked ? <LockedMode mode={mode} onRetry={() => void retryOwnership()} /> : <ModeContent mode={mode} projectId={projectId} readOnly={leaseMode !== "owner"} onSubtitle={setChildSubtitle} />}
      </main>
      {session.preservationOpen && settings.showPreservationWarnings ? <aside className="workspace-insight-panel">
        <div className="workspace-insight-panel__header"><div><p className="eyebrow">What this tool changes</p><h2>{workspaceModeLabel(mode)}</h2></div><button aria-label="Close what-changes panel" onClick={() => void togglePanel("preservationOpen")} type="button">×</button></div>
        <p>{contract.summary}</p>
        <ContractSection items={contract.preserves} label="Preserved" tone="safe" />
        <ContractSection items={contract.changes} label="Changes" tone="neutral" />
        {contract.risks.length ? <ContractSection items={contract.risks} label="Possible losses" tone="warning" /> : null}
        <div className={contract.destructive ? "preservation-verdict preservation-verdict--warning" : "preservation-verdict"}>{contract.destructive ? "This tool creates a separate output and may rebuild some PDF structures." : "Your original PDF remains unchanged."}</div>
      </aside> : null}
      {session.timelineOpen ? <aside className="workspace-insight-panel workspace-timeline">
        <div className="workspace-insight-panel__header"><div><p className="eyebrow">Project timeline</p><h2>History & checkpoints</h2></div><button aria-label="Close history panel" onClick={() => void togglePanel("timelineOpen")} type="button">×</button></div>
        <div className="checkpoint-create"><input aria-label="Checkpoint label" onChange={(event) => setCheckpointLabel(event.target.value)} placeholder="Checkpoint name" value={checkpointLabel} /><button disabled={checkpointBusy} onClick={() => void createCheckpoint()} type="button">{checkpointBusy ? "Saving…" : "Create"}</button></div>
        <div className="timeline-section"><h3>Restorable checkpoints</h3>{checkpoints.length ? checkpoints.map((checkpoint) => <article className="checkpoint-card" key={checkpoint.id}><div><strong>{checkpoint.label}</strong><small>{formatTime(checkpoint.createdAt)} · {formatBytes(checkpoint.byteLength)}</small></div><div><button disabled={checkpointBusy} onClick={() => void restoreCheckpoint(checkpoint)} type="button">Restore copy</button><button aria-label={`Delete ${checkpoint.label}`} onClick={() => void removeCheckpoint(checkpoint.id)} type="button">×</button></div></article>) : <p className="muted">No checkpoints yet. A checkpoint stores a complete local project package.</p>}</div>
        <div className="timeline-section"><h3>Revision lineage</h3>{revisions.length ? <ol className="timeline-list">{revisions.slice(0,20).map((revision) => <li key={revision.id}><span className="timeline-dot timeline-dot--committed" /><div><strong>{revision.operation}</strong><small>revision {revision.sequence} · {formatTime(revision.createdAt)} · {revision.projectId === projectId ? "current project" : "related output"}</small></div></li>)}</ol> : <p className="muted">No document revisions recorded yet.</p>}</div>
        <div className="timeline-section"><h3>Document transactions</h3>{transactions.length ? <ol className="timeline-list">{transactions.slice(0,20).map((transaction) => <li key={transaction.id}><span className={`timeline-dot timeline-dot--${transaction.status}`} /><div><strong>{transaction.operation}</strong><small>{transaction.status} · {formatTime(transaction.completedAt ?? transaction.startedAt)}</small></div></li>)}</ol> : <p className="muted">No committed document transformations yet.</p>}</div>
        <div className="timeline-section"><h3>Workspace events</h3>{events.length ? <ol className="timeline-list">{events.map((event) => <li key={event.id}><span className="timeline-dot" /><div><strong>{event.label}</strong><small>{formatTime(event.createdAt)}</small></div></li>)}</ol> : <p className="muted">No project events recorded yet.</p>}</div>
      </aside> : null}
    </div>
    <nav className="workspace-mobile-nav" aria-label="Document tools">
      {[
        { mode: "viewer" as WorkspaceMode, label: "Read", icon: "▤" },
        { mode: "editor" as WorkspaceMode, label: "Edit", icon: "✎" },
        { mode: "organizer" as WorkspaceMode, label: "Pages", icon: "▦" },
        { mode: "toolbox" as WorkspaceMode, label: "Tools", icon: "⌘" }
      ].map((item) => <button aria-current={mode === item.mode ? "page" : undefined} className={mode === item.mode ? "active" : ""} key={item.mode} onClick={() => void switchMode(item.mode)} type="button"><span aria-hidden="true">{item.icon}</span><small>{item.label}</small></button>)}
      <button aria-controls="workspace-mobile-tools" aria-expanded={mobileToolsOpen} aria-haspopup="dialog" className={mobileToolsOpen ? "active" : ""} onClick={() => setMobileToolsOpen((open) => !open)} type="button"><span aria-hidden="true">•••</span><small>More</small></button>
    </nav>
    {mobileToolsOpen ? <div className="workspace-mobile-sheet-backdrop" onClick={closeMobileTools} role="presentation"><section aria-label="More document tools" aria-modal="true" className="workspace-mobile-sheet" id="workspace-mobile-tools" onClick={(event) => event.stopPropagation()} ref={mobileSheetRef} role="dialog">
      <div className="workspace-mobile-sheet__handle" aria-hidden="true" />
      <header><div><p className="eyebrow">Document tools</p><h2>More</h2></div><button aria-label="Close tools" onClick={closeMobileTools} type="button">×</button></header>
      <div className="workspace-mobile-sheet__grid">{availableModes.filter((item) => !["viewer", "editor", "organizer", "toolbox"].includes(item)).map((item) => <button className={item === mode ? "active" : ""} key={item} onClick={() => void switchMode(item)} type="button"><ModeIcon mode={item}/><span>{workspaceModeLabel(item)}</span></button>)}</div>
      {settings.experienceMode === "advanced" ? <div className="workspace-mobile-sheet__technical"><strong>Technical</strong>{technicalModes.map((item) => <button className={item === mode ? "active" : ""} key={item} onClick={() => void switchMode(item)} type="button"><ModeIcon mode={item}/><span>{workspaceModeLabel(item)}</span></button>)}</div> : <button className="workspace-mobile-sheet__upgrade" onClick={() => setExperienceMode("advanced")} type="button">Show advanced tools</button>}
      <div className="workspace-mobile-sheet__actions"><button onClick={() => { closeMobileTools(); void togglePanel("timelineOpen"); }} type="button">History & checkpoints</button>{settings.showPreservationWarnings ? <button onClick={() => { closeMobileTools(); void togglePanel("preservationOpen"); }} type="button">What changes?</button> : null}<a href={routeHref({ name: "batch" })}>Batch automation</a><a href={routeHref({ name: "projects" })}>Documents</a></div>
    </section></div> : null}
  </div>;
}

function LockedMode({ mode, onRetry }: { mode: WorkspaceMode; onRetry: () => void }) {
  return <div className="workspace-locked-mode"><div><p className="eyebrow">Write protection</p><h2>{workspaceModeLabel(mode)} is locked in this tab</h2><p>Only the tab that owns this local project may change editor, OCR, security, or compliance state. This prevents two tabs from silently overwriting each other.</p><button className="button" onClick={onRetry} type="button">Try editing here</button></div></div>;
}

function ModeContent({ mode, projectId, readOnly, onSubtitle }: { mode: WorkspaceMode; projectId: string; readOnly: boolean; onSubtitle: (value?: string) => void }) {
  const onTitleChange = (_title: string, subtitle?: string) => onSubtitle(subtitle);
  if (mode === "viewer") return <ViewerPage onTitleChange={onTitleChange} projectId={projectId} readOnly={readOnly} />;
  if (mode === "editor") return <EditorPage onTitleChange={onTitleChange} projectId={projectId} />;
  if (mode === "organizer") return <OrganizerPage onTitleChange={onTitleChange} projectId={projectId} />;
  if (mode === "secure") return <SecurePage onTitleChange={onTitleChange} projectId={projectId} />;
  if (mode === "ocr") return <OcrPage onTitleChange={onTitleChange} projectId={projectId} />;
  if (mode === "compress") return <CompressionPage onTitleChange={onTitleChange} projectId={projectId} />;
  if (mode === "inspector") return <InspectorPage onTitleChange={onTitleChange} projectId={projectId} />;
  if (mode === "repair") return <RepairPage onTitleChange={onTitleChange} projectId={projectId} />;
  if (mode === "preservation") return <PreservationPage onTitleChange={onTitleChange} projectId={projectId} />;
  if (mode === "native") return <NativeEditorPage onTitleChange={onTitleChange} projectId={projectId} />;
  if (mode === "compliance") return <CompliancePage onTitleChange={onTitleChange} projectId={projectId} />;
  if (mode === "toolbox") return <ToolboxPage onTitleChange={onTitleChange} projectId={projectId} />;
  return <ProfessionalPage onTitleChange={onTitleChange} projectId={projectId} />;
}

function ContractSection({ label, items, tone }: { label: string; items: string[]; tone: "safe" | "neutral" | "warning" }) {
  return <section className={`contract-section contract-section--${tone}`}><h3>{label}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>;
}

function ModeIcon({ mode }: { mode: WorkspaceMode }) {
  const icons: Record<WorkspaceMode, string> = { viewer: "▤", editor: "✎", organizer: "▦", secure: "⌾", ocr: "◎", compress: "⇣", inspector: "◇", repair: "↻", professional: "◆", preservation: "◈", native: "✣", compliance: "✓", toolbox: "⌘" };
  return <span aria-hidden="true">{icons[mode]}</span>;
}

function buildContextActions(project: ProjectManifest | null): Array<{ mode: WorkspaceMode; label: string }> {
  if (!project) return [];
  const actions: Array<{ mode: WorkspaceMode; label: string }> = [];
  if (project.summary.formFieldCount) actions.push({ mode: "secure", label: `Fill ${project.summary.formFieldCount} form fields` });
  if (project.summary.encrypted) actions.push({ mode: "secure", label: "Review protection" });
  if (project.summary.pageCount > 30) actions.push({ mode: "organizer", label: "Organize pages" });
  if (!project.summary.hasOutline && project.summary.pageCount > 15) actions.push({ mode: "inspector", label: "Inspect document structure" });
  return actions.slice(0, 3);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let current = value / 1024;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) { current /= 1024; index += 1; }
  return `${current.toFixed(current >= 100 ? 0 : 1)} ${units[index]}`;
}

function formatTime(value: number): string {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function operationStageLabel(stage: ProjectOperationSnapshot["stage"]): string {
  if (stage === "queued") return "Waiting for exclusive document access…";
  if (stage === "validating") return "Validating output…";
  if (stage === "committing") return "Saving a new revision…";
  return "Processing locally…";
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
