import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { navigateTo, readAppRoute, routeHref } from "../core/appRouter";
import { importPdfProject } from "../projects/projectRepository";
import { rememberProjectSessionPassword } from "../security/sessionPasswords";
import { Icon } from "../components/Icon";
import { getTask, pdfTasks, taskCategories, taskRoute, type PdfTask } from "../ia/taskCatalog";
import { rankTasksByQuery } from "../ia/taskSearch";
import { createGenericTaskCapabilityContext, evaluateTaskCapability, isCapabilityBlocked, type TaskCapability } from "../capabilities/taskCapability";
import { TaskCapabilityChip } from "../capabilities/TaskCapabilityStatus";
import "../ia/taskArchitecture.css";

export function ToolsPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const taskRef = useRef<PdfTask | null>(null);
  const initialRoute = readAppRoute();
  const selectedTask = getTask(initialRoute.name === "tools" ? initialRoute.taskId : undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingTask, setPendingTask] = useState<PdfTask | null>(null);
  const [password, setPassword] = useState("");
  const genericContext = useMemo(() => createGenericTaskCapabilityContext(), []);
  const capabilityFor = (task: PdfTask): TaskCapability => evaluateTaskCapability(task, genericContext);

  function chooseTask(task: PdfTask): void {
    setError(null);
    const capability = capabilityFor(task);
    if (isCapabilityBlocked(capability) || capability.state === "hidden") return;
    if (task.target.kind === "route") {
      navigateTo(task.target.route);
      return;
    }
    taskRef.current = task;
    inputRef.current?.click();
  }

  async function openWorkspace(file: File, task: PdfTask, suppliedPassword?: string): Promise<void> {
    if (task.target.kind !== "workspace") return;
    setBusy(true);
    setError(null);
    try {
      const project = await importPdfProject(file, suppliedPassword);
      if (suppliedPassword) rememberProjectSessionPassword(project.id, suppliedPassword);
      navigateTo({ name: "workspace", projectId: project.id, mode: task.target.mode, taskId: task.id });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (/password|encrypted/i.test(message) && !suppliedPassword) {
        setPendingFile(file);
        setPendingTask(task);
        setError("This PDF requires a password. It is used only for this local session and is not stored.");
      } else setError(message);
    } finally {
      setBusy(false);
    }
  }

  const searching = Boolean(query.trim());
  const visibleTasks = useMemo(() => {
    const needle = query.trim();
    if (!needle) return pdfTasks.filter((task) => task.audience !== "recovery");
    return rankTasksByQuery(pdfTasks, needle);
  }, [query]);

  const selectedCapability = selectedTask ? capabilityFor(selectedTask) : undefined;

  return <div className="tools-page task-browser">
    <section className="tools-hero task-browser__hero"><div><p className="eyebrow">All PDF tools</p><h2>Choose what you want to do</h2><p>Start with the job, not a technical mode. If a PDF has a limitation that matters, PDF Studio will tell you before making changes.</p></div><label className="task-browser__search"><span className="visually-hidden">Search PDF tasks</span><input autoComplete="off" onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search: merge, edit, compress, sign…" type="search" value={query}/></label></section>

    {selectedTask && selectedCapability ? <section className="task-focus" aria-label="Selected PDF task"><div><span className="task-focus__icon"><Icon name={selectedTask.icon} size={26}/></span><div><p className="eyebrow">Ready to start</p><h2>{selectedTask.label}</h2><p>{selectedTask.description}</p>{selectedCapability.state !== "available" ? <TaskCapabilityChip capability={selectedCapability}/> : null}{selectedCapability.reason && selectedCapability.state !== "available" ? <small className="task-capability-reason">{selectedCapability.reason}</small> : null}{selectedCapability.recovery && isCapabilityBlocked(selectedCapability) ? <small className="task-capability-recovery">{selectedCapability.recovery}</small> : null}</div></div><button className="button" disabled={busy || isCapabilityBlocked(selectedCapability)} onClick={() => chooseTask(selectedTask)} type="button">{selectedTask.target.kind === "workspace" ? "Choose PDF" : "Open tool"}</button></section> : null}

    {error ? <div className="error-banner"><strong>Could not open the task</strong><span>{error}</span></div> : null}
    {pendingFile && pendingTask ? <section className="password-panel"><div><strong>Password required</strong><span>{pendingFile.name} · {pendingTask.label}</span></div><input autoFocus autoComplete="off" onChange={(event) => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password}/><button className="button" disabled={!password || busy} onClick={() => void openWorkspace(pendingFile, pendingTask, password)} type="button">Continue to {pendingTask.label}</button><button className="button button--ghost" onClick={() => { setPendingFile(null); setPendingTask(null); setPassword(""); setError(null); }} type="button">Cancel</button></section> : null}

    {searching && visibleTasks.length ? <section className="tool-category task-category task-category--search-results"><div className="section-heading"><div><p className="eyebrow">Search results</p><h2>Best matches for “{query.trim()}”</h2></div></div><div className="tool-grid task-grid">{visibleTasks.filter((task) => capabilityFor(task).state !== "hidden").map((task) => <TaskTile busy={busy} capability={capabilityFor(task)} key={task.id} onChoose={chooseTask} task={task}/>)}</div></section> : null}

    {!searching ? taskCategories.map((category) => {
      const tasks = visibleTasks.filter((task) => task.category === category.id && task.audience !== "recovery").filter((task) => capabilityFor(task).state !== "hidden");
      if (!tasks.length) return null;
      return <section className="tool-category task-category" key={category.id}><div className="section-heading"><div><p className="eyebrow">{category.label}</p><h2>{category.description}</h2></div></div><div className="tool-grid task-grid">{tasks.map((task) => <TaskTile busy={busy} capability={capabilityFor(task)} key={task.id} onChoose={chooseTask} task={task}/>)}</div></section>;
    }) : null}

    {!visibleTasks.length ? <div className="empty-state"><strong>No matching PDF task</strong><p>Try a simple action such as edit, merge, pages, compress, sign, convert, or OCR.</p></div> : null}

    {!searching ? <section className="phase2-scope"><strong>Need a specialist tool?</strong><p>Accessibility, print preparation, archive readiness, Batch, diagnostics, and Repair are still available here without crowding the everyday choices on Home.</p><a href={routeHref({ name: "help" })}>Open Help</a></section> : null}

    <input ref={inputRef} hidden accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; const task = taskRef.current; if (file && task) void openWorkspace(file, task); event.target.value = ""; }} type="file"/>
  </div>;
}

function TaskTile({ task, busy, onChoose, capability }: { task: PdfTask; busy: boolean; onChoose: (task: PdfTask) => void; capability: TaskCapability }) {
  if (capability.state === "hidden") return null;
  const blocked = isCapabilityBlocked(capability);
  const route = task.target.kind === "route" ? taskRoute(task) : null;
  const content = <><span><Icon name={task.icon} size={24}/></span><div><strong>{task.label}</strong><p>{task.description}</p>{capability.state !== "available" ? <TaskCapabilityChip capability={capability}/> : null}{capability.reason && capability.state !== "available" ? <small className="task-capability-reason">{capability.reason}</small> : null}{capability.recovery && blocked ? <small className="task-capability-recovery">{capability.recovery}</small> : null}</div></>;
  if (blocked) return <button aria-disabled="true" className="tool-tile task-tile tool-tile--blocked" disabled type="button">{content}</button>;
  if (route) return <a className="tool-tile task-tile" href={routeHref(route)}>{content}</a>;
  return <button aria-label={`Open ${task.label}`} className="tool-tile task-tile" disabled={busy} onClick={() => onChoose(task)} type="button">{content}</button>;
}
