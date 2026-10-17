import { DocumentControlsContext, useCompactDocumentControls } from "../product/CompactDocumentControls";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { navigateTo, routeHref } from "../core/appRouter";
import { TaskDirectory } from "../product/TaskDirectory";
import { handOffTaskFiles } from "../product/fileHandoff";
import { rememberProjectSessionPassword } from "../security/sessionPasswords";
import { prepareDocumentSnapshot } from "../product/documentSnapshot";
import { registerDocumentTaskLauncher } from "../product/documentTaskLauncher";
import { taskRoute, getTask, type PdfTask } from "../ia/taskCatalog";
import { getProject, createDerivedProjectFromBytes } from "../projects/projectRepository";
import { createProjectLease, type ProjectLease, type ProjectLeaseMode } from "../projects/projectLease";
import { readSettings, SETTINGS_CHANGED_EVENT } from "../settings/settingsStore";
import type { ProjectManifest } from "../types/project";
import type { AppSettings } from "../types/settings";
import type { WorkspaceCheckpoint, WorkspaceEvent, WorkspaceMode, WorkspaceSession } from "../types/workspace";
import type { DocumentRevision, DocumentTransaction } from "../types/revision";
import { listDocumentLineage, listDocumentTransactions, reconcileInterruptedTransactions } from "../revisions/revisionRepository";
import { Icon } from "../components/Icon";
import { useModalFocus } from "../accessibility/modalFocus";
import { getPreservationContract } from "./preservationContracts";
import { beginWorkspaceHeartbeat, readInterruptedWorkspaceSession, type InterruptedWorkspaceSession } from "../recovery/sessionHeartbeat";
import { cancelProjectOperation, runProjectOperation, subscribeProjectOperation, type ProjectOperationSnapshot } from "../operations/projectOperationCoordinator";
import {
  activateWorkspaceProject,
  createWorkspaceCheckpoint,
  deleteWorkspaceCheckpoint,
  listWorkspaceCheckpoints,
  listWorkspaceEvents,
  restoreWorkspaceCheckpoint,
  setWorkspacePanelState,
  updateWorkspaceMode,
  workspaceModeLabel
} from "./workspaceRepository";

const ViewerPage = lazy(() => import("../views/ViewerPage").then(({ ViewerPage }) => ({ default: ViewerPage })));
const EditorPage = lazy(() => import("../views/EditorPage").then(({ EditorPage }) => ({ default: EditorPage })));
const OrganizerPage = lazy(() => import("../views/OrganizerPage").then(({ OrganizerPage }) => ({ default: OrganizerPage })));
const SecurePage = lazy(() => import("../views/SecurePage").then(({ SecurePage }) => ({ default: SecurePage })));
const OcrPage = lazy(() => import("../views/OcrPage").then(({ OcrPage }) => ({ default: OcrPage })));
const CompressionPage = lazy(() => import("../views/CompressionPage").then(({ CompressionPage }) => ({ default: CompressionPage })));
const InspectorPage = lazy(() => import("../views/InspectorPage").then(({ InspectorPage }) => ({ default: InspectorPage })));
const RepairPage = lazy(() => import("../views/RepairPage").then(({ RepairPage }) => ({ default: RepairPage })));
const ProfessionalPage = lazy(() => import("../views/ProfessionalPage").then(({ ProfessionalPage }) => ({ default: ProfessionalPage })));
const PreservationPage = lazy(() => import("../views/PreservationPage").then(({ PreservationPage }) => ({ default: PreservationPage })));
const NativeEditorPage = lazy(() => import("../views/NativeEditorPage").then(({ NativeEditorPage }) => ({ default: NativeEditorPage })));
const CompliancePage = lazy(() => import("../views/CompliancePage").then(({ CompliancePage }) => ({ default: CompliancePage })));
const DocumentToolsPage = lazy(() => import("../views/DocumentToolsPage").then(({ DocumentToolsPage }) => ({ default: DocumentToolsPage })));

interface UnifiedWorkspaceProps {
  projectId: string;
  mode: WorkspaceMode;
  taskId?: string;
  onTitleChange?: (title: string, subtitle?: string) => void;
}

export function UnifiedWorkspace({ projectId, mode, taskId, onTitleChange }: UnifiedWorkspaceProps) {
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [project, setProject] = useState<ProjectManifest | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => readSettings());
  const [events, setEvents] = useState<WorkspaceEvent[]>([]);
  const [checkpoints, setCheckpoints] = useState<WorkspaceCheckpoint[]>([]);
  const [transactions, setTransactions] = useState<DocumentTransaction[]>([]);
  const [revisions, setRevisions] = useState<DocumentRevision[]>([]);
  const [timelineLoaded, setTimelineLoaded] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [checkpointLabel, setCheckpointLabel] = useState("");
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [childSubtitle, setChildSubtitle] = useState<string | undefined>();
  const [leaseMode, setLeaseMode] = useState<ProjectLeaseMode>("acquiring");
  const [leaseHandle, setLeaseHandle] = useState<ProjectLease | null>(null);
  const [interruptedSession, setInterruptedSession] = useState<InterruptedWorkspaceSession | null>(() => readInterruptedWorkspaceSession(projectId));
  const [activeOperation, setActiveOperation] = useState<ProjectOperationSnapshot | null>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const handoffRef = useRef(false);
  const compactControls = useCompactDocumentControls();
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const mobileSheetRef = useRef<HTMLElement | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const closeMobileTools = useCallback(() => setMobileToolsOpen(false), []);
  useModalFocus(mobileToolsOpen, mobileSheetRef, closeMobileTools);

  const refreshTimeline = useCallback(async (manifest: ProjectManifest) => {
    const rootProjectId = manifest.lineage?.rootProjectId ?? projectId;
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
    setTimelineLoaded(true);
  }, [projectId]);

  const ensureTimeline = useCallback(async () => {
    if (!project || project.id !== projectId || timelineLoading || timelineLoaded) return;
    setTimelineLoading(true);
    try {
      await refreshTimeline(project);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setTimelineLoading(false);
    }
  }, [project, projectId, refreshTimeline, timelineLoaded, timelineLoading]);

  useEffect(() => {
    let cancelled = false;
    setProject((current) => current?.id === projectId ? current : null);
    setError(null);
    setChildSubtitle(undefined);
    setTimelineLoaded(false);
    setTimelineLoading(false);
    setEvents([]);
    setCheckpoints([]);
    setTransactions([]);
    setRevisions([]);
    void (async () => {
      try {
        const manifest = await getProject(projectId);
        if (!manifest) throw new Error("Project not found. It may have been deleted or browser storage may have been cleared.");
        const nextSession = await activateWorkspaceProject(projectId, modeRef.current);
        if (cancelled) return;
        setProject(manifest);
        setSession(nextSession);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!project || project.id !== projectId || !session) return;
    const tab = session.tabs.find((item) => item.projectId === projectId);
    if (!tab || tab.lastMode === mode) return;
    const now = Date.now();
    setSession((current) => current ? {
      ...current,
      activeProjectId: projectId,
      tabs: current.tabs.map((item) => item.projectId === projectId ? { ...item, lastMode: mode, lastActivatedAt: now } : item),
      updatedAt: now
    } : current);
    void updateWorkspaceMode(projectId, mode).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [mode, project, projectId, session]);

  useEffect(() => {
    setChildSubtitle(undefined);
  }, [mode]);

  useEffect(() => {
    if (session?.timelineOpen && project?.id === projectId && !timelineLoaded && !timelineLoading) void ensureTimeline();
  }, [ensureTimeline, project, projectId, session?.timelineOpen, timelineLoaded, timelineLoading]);

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
    setLeaseMode("acquiring");
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
      if (!cancelled && recovered.length && timelineLoaded && project?.id === projectId) await refreshTimeline(project);
    })().catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [leaseMode, project, projectId, refreshTimeline, timelineLoaded]);

  useEffect(() => {
    if (!project || project.id !== projectId) return;
    onTitleChange?.(project.name, childSubtitle ?? `${project.summary.pageCount} pages · ${workspaceModeLabel(mode)}`);
  }, [childSubtitle, mode, onTitleChange, project, projectId]);

  const contract = useMemo(() => getPreservationContract(mode), [mode]);
  const contextActions = useMemo(() => buildContextActions(project), [project]);
  const modeRequiresOwnership = !["viewer", "inspector"].includes(mode);
  const workspaceLocked = leaseMode === "read-only" && modeRequiresOwnership;
  const workspaceAcquiring = leaseMode === "acquiring" && modeRequiresOwnership;

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
      await refreshTimeline(project);
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
    if (!project) return;
    await deleteWorkspaceCheckpoint(checkpointId);
    await refreshTimeline(project);
  }

  async function togglePanel(panel: "timelineOpen" | "preservationOpen"): Promise<void> {
    if (!session) return;
    const opening = !session[panel];
    const next = await setWorkspacePanelState(panel === "timelineOpen"
      ? { timelineOpen: opening, preservationOpen: opening ? false : session.preservationOpen }
      : { preservationOpen: opening, timelineOpen: opening ? false : session.timelineOpen });
    setSession(next);
    if (panel === "timelineOpen" && opening && !timelineLoaded) void ensureTimeline();
  }

  async function chooseDocumentTask(task: PdfTask, readOnly = false): Promise<void> {
    if (activeOperation || handoffRef.current) { setError("Finish or cancel the current operation before choosing another task."); return; }
    const route = readOnly ? { name: "workspace" as const, projectId, mode: "viewer" as const } : taskRoute(task, projectId); if (!route) return;
    // Same editor: preserve editable objects, selections, and undo history in place.
    if (route.name === "workspace" && route.mode === mode && route.projectId === projectId) { closeMobileTools(); navigateTo(route); return; }
    handoffRef.current = true; setHandoffBusy(true); setError(null);
    try {
      await runProjectOperation(projectId, { label: "Preparing your current document" }, async ({ signal, update }) => {
        update({ detail: "Including and verifying your latest edits…" });
        const snapshot = await prepareDocumentSnapshot(projectId, signal);
        if (route.name === "quick" || task.id === "compare-pdfs") {
          handOffTaskFiles(task.id, [snapshot.file], { passwords: [snapshot.password], warnings: snapshot.warnings });
          closeMobileTools(); navigateTo(taskRoute(task)!); return;
        }
        if (route.name === "workspace" && snapshot.changed) {
          const derived = await createDerivedProjectFromBytes(projectId, snapshot.bytes, snapshot.file.name, "tool-handoff", "application/pdf", snapshot.password);
          if (snapshot.password) rememberProjectSessionPassword(derived.id, snapshot.password);
          closeMobileTools(); navigateTo({ ...route, projectId: derived.id }); return;
        }
        closeMobileTools(); navigateTo(route);
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { handoffRef.current = false; setHandoffBusy(false); }
  }

  const taskLauncherRef = useRef(chooseDocumentTask);
  taskLauncherRef.current = chooseDocumentTask;
  useEffect(() => registerDocumentTaskLauncher(projectId, (task) => taskLauncherRef.current(task)), [projectId]);

  async function retryOwnership(): Promise<void> {
    if (!leaseHandle) return;
    setLeaseMode("acquiring");
    const acquired = await leaseHandle.tryAcquire();
    if (!acquired) setError("This project is still open for editing in another tab. Close that tab or leave it on this read-only workspace.");
  }

  if (error && (!project || project.id !== projectId)) return <div className="workspace-fatal"><strong>Workspace unavailable</strong><p>{error}</p><a className="button" href={routeHref({ name: "projects" })}>Open projects</a></div>;
  if (!project || project.id !== projectId || !session) return <div className="viewer-loading"><span className="spinner" /><strong>Opening document…</strong></div>;


  const compactToolbar = compactControls && (mode === "viewer" || mode === "editor") && !workspaceAcquiring && !workspaceLocked;
  return <DocumentControlsContext.Provider value={{ title: project.name, summary: `${project.summary.pageCount} pages · ${formatBytes(project.byteLength)}`, busy: Boolean(activeOperation),
    onHomeClick: (event) => { if (activeOperation) { event.preventDefault(); setError("Finish or cancel the current operation before leaving this document."); } },
    openActions: () => { if (!activeOperation) setMobileToolsOpen(true); }, openHistory: () => void togglePanel("timelineOpen") }}>
  <div className="document-workspace unified-workspace" data-compact-toolbar={compactToolbar ? "true" : undefined}>
    {compactToolbar ? <h1 className="visually-hidden" id="workspace-document-title">{project.name}</h1> : <header className="document-topbar">
      <a className="document-home" aria-disabled={Boolean(activeOperation)} onClick={(event) => { if (activeOperation) { event.preventDefault(); setError("Finish or cancel the current operation before leaving this document."); } }} href={routeHref({ name: "home" })} aria-label="Back to PDF tools"><Icon name="arrow-left" size={20}/><span>All tools</span></a>
      <div className="document-identity"><h1 id="workspace-document-title" title={project.name}>{project.name}</h1><span>{project.summary.pageCount} pages · {formatBytes(project.byteLength)}{project.summary.encrypted ? " · Protected" : ""}{leaseMode === "read-only" ? " · Read only" : ""}</span></div>
      <div className="document-actions">
        <button aria-label="Document actions" aria-controls="document-actions-dialog" aria-expanded={mobileToolsOpen} aria-haspopup="dialog" className="button button--secondary" disabled={Boolean(activeOperation)} onClick={() => setMobileToolsOpen(true)} type="button"><Icon name="tools" size={18}/><span>Document actions</span></button>
        <button aria-label="History and checkpoints" aria-expanded={session.timelineOpen} className="icon-button" onClick={() => void togglePanel("timelineOpen")} title="History and checkpoints" type="button"><Icon name="undo" size={19}/></button>
        {settings.showPreservationWarnings ? <button aria-label="What changes in this PDF?" aria-expanded={session.preservationOpen} className="icon-button document-integrity" onClick={() => void togglePanel("preservationOpen")} title="What changes in this PDF?" type="button"><Icon name="shield" size={19}/></button> : null}
      </div>
    </header>}
    {error ? <div aria-live="assertive" className="error-banner" role="alert"><strong>Workspace action failed</strong><span>{error}</span><button onClick={() => setError(null)} type="button">Dismiss</button></div> : null}
    {interruptedSession ? <div aria-live="polite" className="warning-banner workspace-recovery-banner" role="status"><div><strong>Recovered after an interrupted session</strong><details><summary>Details</summary><span>The previous workspace heartbeat ended without a clean close. Source PDF bytes were never edited in place; any interrupted document transaction is reconciled before this tab can write.</span></details></div><button className="button button--small button--secondary" onClick={() => setInterruptedSession(null)} type="button">Dismiss</button></div> : null}
    {activeOperation ? <div className="workspace-operation-banner" role="status" aria-live="polite"><div><strong>{activeOperation.label}</strong><span>{activeOperation.detail ?? operationStageLabel(activeOperation.stage)}</span>{activeOperation.progress !== undefined ? <progress max="1" value={activeOperation.progress} /> : null}</div><div><small>{formatElapsed(Date.now() - activeOperation.startedAt)}</small>{activeOperation.cancellable ? <button className="button button--small button--secondary" onClick={() => cancelProjectOperation(projectId)} type="button">Cancel</button> : null}</div></div> : null}
    {leaseMode === "read-only" ? <div className="warning-banner workspace-readonly-banner" role="status"><strong>Read-only in this tab</strong><span>This project is being edited in another tab. You can still read it here, but editing is disabled to prevent conflicting changes.</span><button className="button button--small button--secondary" onClick={() => void retryOwnership()} type="button">Try editing here</button></div> : null}

    <div className={session.timelineOpen || (session.preservationOpen && settings.showPreservationWarnings) ? "workspace-body workspace-body--panel" : "workspace-body"}>
      <section aria-labelledby="workspace-document-title" className={mode === "viewer" ? "workspace-mode-content workspace-mode-content--reader" : "workspace-mode-content"} id="workspace-document-panel">
        {workspaceAcquiring ? <AcquiringMode mode={mode} /> : workspaceLocked ? <LockedMode mode={mode} onRetry={() => void retryOwnership()} /> : <ModeContent taskId={taskId} mode={mode} projectId={projectId} readOnly={leaseMode !== "owner"} onSubtitle={setChildSubtitle} />}
      </section>
      {session.preservationOpen && settings.showPreservationWarnings ? <aside className="workspace-insight-panel">
        <div className="workspace-insight-panel__header"><div><p className="eyebrow">What this tool changes</p><h2>{workspaceModeLabel(mode)}</h2></div><button aria-label="Close what-changes panel" onClick={() => void togglePanel("preservationOpen")} type="button">×</button></div>
        <p>{contract.summary}</p>
        <ContractSection items={contract.preserves} label="Preserved" tone="safe" />
        <ContractSection items={contract.changes} label="Changes" tone="neutral" />
        {contract.risks.length ? <ContractSection items={contract.risks} label="Possible losses" tone="warning" /> : null}
        <div className={contract.destructive ? "preservation-verdict preservation-verdict--warning" : "preservation-verdict"}>{contract.destructive ? "This tool creates a separate output and may rebuild some PDF structures." : "Your original PDF remains unchanged."}</div>
      </aside> : null}
      {session.timelineOpen ? <aside className="workspace-insight-panel workspace-timeline">
        <div className="workspace-insight-panel__header"><div><p className="eyebrow">Project history</p><h2>History & checkpoints</h2></div><button aria-label="Close history panel" onClick={() => void togglePanel("timelineOpen")} type="button">×</button></div>
        {timelineLoading && !timelineLoaded ? <div className="viewer-loading" role="status"><span className="spinner" /><strong>Loading history…</strong></div> : <>
          <div className="checkpoint-create"><input aria-label="Checkpoint label" onChange={(event) => setCheckpointLabel(event.target.value)} placeholder="Checkpoint name" value={checkpointLabel} /><button disabled={checkpointBusy} onClick={() => void createCheckpoint()} type="button">{checkpointBusy ? "Saving…" : "Create"}</button></div>
          <div className="timeline-section"><h3>Restorable checkpoints</h3>{checkpoints.length ? checkpoints.map((checkpoint) => <article className="checkpoint-card" key={checkpoint.id}><div><strong>{checkpoint.label}</strong><small>{formatTime(checkpoint.createdAt)} · {formatBytes(checkpoint.byteLength)}</small></div><div><button disabled={checkpointBusy} onClick={() => void restoreCheckpoint(checkpoint)} type="button">Restore copy</button><button aria-label={`Delete ${checkpoint.label}`} onClick={() => void removeCheckpoint(checkpoint.id)} type="button">×</button></div></article>) : <p className="muted">No checkpoints yet. A checkpoint stores a complete local project package.</p>}</div>
          <details className="timeline-technical"><summary>Technical history</summary><div className="timeline-section"><h3>Revision lineage</h3>{revisions.length ? <ol className="timeline-list">{revisions.slice(0,20).map((revision) => <li key={revision.id}><span className="timeline-dot timeline-dot--committed" /><div><strong>{revision.operation}</strong><small>revision {revision.sequence} · {formatTime(revision.createdAt)} · {revision.projectId === projectId ? "current project" : "related output"}</small></div></li>)}</ol> : <p className="muted">No document revisions recorded yet.</p>}</div><div className="timeline-section"><h3>Document transactions</h3>{transactions.length ? <ol className="timeline-list">{transactions.slice(0,20).map((transaction) => <li key={transaction.id}><span className={`timeline-dot timeline-dot--${transaction.status}`} /><div><strong>{transaction.operation}</strong><small>{transaction.status} · {formatTime(transaction.completedAt ?? transaction.startedAt)}</small></div></li>)}</ol> : <p className="muted">No committed document transformations yet.</p>}</div><div className="timeline-section"><h3>Workspace events</h3>{events.length ? <ol className="timeline-list">{events.map((event) => <li key={event.id}><span className="timeline-dot" /><div><strong>{event.label}</strong><small>{formatTime(event.createdAt)}</small></div></li>)}</ol> : <p className="muted">No project events recorded yet.</p>}</div></details>
        </>}
      </aside> : null}
    </div>

    {mobileToolsOpen ? <div className="product-modal-backdrop" onClick={closeMobileTools} role="presentation"><section aria-label="Document actions" aria-modal="true" className="product-modal document-task-dialog" id="document-actions-dialog" onClick={(event) => event.stopPropagation()} ref={mobileSheetRef} role="dialog">
      <header><div><p className="eyebrow">WORK WITH THIS DOCUMENT</p><h2>What would you like to do?</h2></div><button className="icon-button" aria-label="Close document actions" onClick={closeMobileTools} type="button"><Icon name="close"/></button></header>
      <p className="product-muted">{project.name}</p>{handoffBusy ? <p role="status">Preparing and checking your latest edits…</p> : null}{error ? <p role="alert">{error}</p> : null}
      <div className="document-action-shortcuts"><button className="button button--secondary" disabled={handoffBusy} onClick={() => void chooseDocumentTask(getTask("edit-pdf")!)} type="button"><Icon name="edit"/>Edit this PDF</button><button className="button button--secondary" disabled={handoffBusy} onClick={() => void chooseDocumentTask(getTask("edit-pdf")!, true)} type="button"><Icon name="read"/>Read PDF</button><button className="button button--secondary" disabled={handoffBusy} onClick={() => void chooseDocumentTask(getTask("organize-pages")!)} type="button"><Icon name="pages"/>Arrange pages</button></div>
      <div className="document-action-shortcuts"><button className="button button--secondary" onClick={() => { closeMobileTools(); void togglePanel("timelineOpen"); }} type="button">History & checkpoints</button>{settings.showPreservationWarnings ? <button className="button button--secondary" onClick={() => { closeMobileTools(); void togglePanel("preservationOpen"); }} type="button">What changes in this PDF?</button> : null}</div>
      <fieldset className="document-task-options" disabled={handoffBusy}><legend className="visually-hidden">Choose the next task</legend><TaskDirectory compact projectId={projectId} kind="pdf" fileCount={1} onChoose={(task) => void chooseDocumentTask(task)} /></fieldset>
      <p className="product-fineprint">Your latest editor changes are included and checked before the next tool opens. The original and editable project remain unchanged.</p>
    </section></div> : null}
  </div></DocumentControlsContext.Provider>;
}

function AcquiringMode({ mode }: { mode: WorkspaceMode }) {
  return <div className="workspace-locked-mode" role="status"><div><span className="spinner" /><p className="eyebrow">Preparing workspace</p><h2>Getting edit access…</h2><p>{workspaceModeLabel(mode)} will open as soon as this tab confirms safe local ownership. Nothing needs to be retried.</p></div></div>;
}

function LockedMode({ mode, onRetry }: { mode: WorkspaceMode; onRetry: () => void }) {
  return <div className="workspace-locked-mode"><div><p className="eyebrow">Write protection</p><h2>{workspaceModeLabel(mode)} is locked in this tab</h2><p>Only the tab that owns this local project may change document state. This prevents two tabs from silently overwriting each other.</p><button className="button" onClick={onRetry} type="button">Try editing here</button></div></div>;
}

function ModeContent({ mode, projectId, taskId, readOnly, onSubtitle }: { taskId?: string; mode: WorkspaceMode; projectId: string; readOnly: boolean; onSubtitle: (value?: string) => void }) {
  const onTitleChange = (_title: string, subtitle?: string) => onSubtitle(subtitle);
  let content;
  if (mode === "viewer") content = <ViewerPage onTitleChange={onTitleChange} projectId={projectId} readOnly={readOnly} />;
  else if (mode === "editor") content = <EditorPage onTitleChange={onTitleChange} projectId={projectId} taskId={taskId} />;
  else if (mode === "organizer") content = <OrganizerPage onTitleChange={onTitleChange} projectId={projectId} />;
  else if (mode === "secure") content = <SecurePage taskId={taskId} onTitleChange={onTitleChange} projectId={projectId} />;
  else if (mode === "ocr") content = <OcrPage onTitleChange={onTitleChange} projectId={projectId} />;
  else if (mode === "compress") content = <CompressionPage onTitleChange={onTitleChange} projectId={projectId} />;
  else if (mode === "inspector") content = <InspectorPage onTitleChange={onTitleChange} projectId={projectId} />;
  else if (mode === "repair") content = <RepairPage onTitleChange={onTitleChange} projectId={projectId} />;
  else if (mode === "preservation") content = <PreservationPage onTitleChange={onTitleChange} projectId={projectId} />;
  else if (mode === "native") content = <NativeEditorPage onTitleChange={onTitleChange} projectId={projectId} />;
  else if (mode === "compliance") content = <CompliancePage onTitleChange={onTitleChange} projectId={projectId} />;
  else if (mode === "toolbox") content = <DocumentToolsPage onTitleChange={onTitleChange} projectId={projectId} />;
  else content = <ProfessionalPage onTitleChange={onTitleChange} projectId={projectId} />;
  return <Suspense fallback={<ModeLoading mode={mode} />}>{content}</Suspense>;
}

function ModeLoading({ mode }: { mode: WorkspaceMode }) {
  return <div className="viewer-loading workspace-mode-loading" role="status" aria-live="polite"><span className="spinner" /><strong>Opening {workspaceModeLabel(mode)}…</strong></div>;
}

function ContractSection({ label, items, tone }: { label: string; items: string[]; tone: "safe" | "neutral" | "warning" }) {
  return <section className={`contract-section contract-section--${tone}`}><h3>{label}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>;
}

function buildContextActions(project: ProjectManifest | null): Array<{ mode: WorkspaceMode; label: string }> {
  if (!project) return [];
  const actions: Array<{ mode: WorkspaceMode; label: string }> = [];
  if (project.summary.formFieldCount) actions.push({ mode: "secure", label: `Fill ${project.summary.formFieldCount} form fields` });
  if (project.summary.encrypted) actions.push({ mode: "secure", label: "Review protection" });
  if (project.summary.pageCount > 30) actions.push({ mode: "organizer", label: "Organize pages" });
  if (project.byteLength > 20_000_000) actions.push({ mode: "compress", label: "Reduce file size" });
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
