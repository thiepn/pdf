import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { navigateTo, readAppRoute, routeHref } from "../core/appRouter";
import { importPdfProject } from "../projects/projectRepository";
import { rememberProjectSessionPassword } from "../security/sessionPasswords";
import { Icon } from "../components/Icon";
import { getTask, pdfTasks, taskCategories, taskRoute, taskSearchText, type PdfTask } from "../ia/taskCatalog";
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

  function chooseTask(task: PdfTask): void {
    setError(null);
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

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return pdfTasks.filter((task) => task.audience !== "recovery");
    return pdfTasks.filter((task) => taskSearchText(task).includes(needle));
  }, [query]);

  const recoveryTasks = visibleTasks.filter((task) => task.audience === "recovery");

  return <div className="tools-page task-browser">
    <section className="tools-hero task-browser__hero"><div><p className="eyebrow">PDF tasks</p><h2>What do you want to do?</h2><p>Search for an outcome such as crop, sign, OCR, redact, split, compare, or remove metadata. PDF Studio chooses the correct workspace for you.</p></div><label className="task-browser__search"><span className="visually-hidden">Search PDF tasks</span><input autoComplete="off" onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search PDF tasks…" type="search" value={query}/></label></section>

    {selectedTask ? <section className="task-focus" aria-label="Selected PDF task"><div><span className="task-focus__icon"><Icon name={selectedTask.icon} size={26}/></span><div><p className="eyebrow">Selected task</p><h2>{selectedTask.label}</h2><p>{selectedTask.description}</p></div></div><button className="button" disabled={busy} onClick={() => chooseTask(selectedTask)} type="button">{selectedTask.target.kind === "workspace" ? "Choose PDF" : "Open tool"}</button></section> : null}

    {error ? <div className="error-banner"><strong>Could not open the task</strong><span>{error}</span></div> : null}
    {pendingFile && pendingTask ? <section className="password-panel"><div><strong>Password required</strong><span>{pendingFile.name} · {pendingTask.label}</span></div><input autoFocus autoComplete="off" onChange={(event) => setPassword(event.target.value)} placeholder="PDF password" type="password" value={password}/><button className="button" disabled={!password || busy} onClick={() => void openWorkspace(pendingFile, pendingTask, password)} type="button">Continue to {pendingTask.label}</button><button className="button button--ghost" onClick={() => { setPendingFile(null); setPendingTask(null); setPassword(""); setError(null); }} type="button">Cancel</button></section> : null}

    {taskCategories.map((category) => {
      const tasks = visibleTasks.filter((task) => task.category === category.id && task.audience !== "recovery");
      if (!tasks.length) return null;
      return <section className="tool-category task-category" key={category.id}><div className="section-heading"><div><p className="eyebrow">{category.label}</p><h2>{category.description}</h2></div></div><div className="tool-grid task-grid">{tasks.map((task) => <TaskTile busy={busy} key={task.id} onChoose={chooseTask} task={task}/>)}</div></section>;
    })}

    {recoveryTasks.length ? <section className="tool-category task-category"><div className="section-heading"><div><p className="eyebrow">Troubleshooting document files</p><h2>Use these only when a PDF needs diagnosis or repair.</h2></div></div><div className="tool-grid task-grid">{recoveryTasks.map((task) => <TaskTile busy={busy} key={task.id} onChoose={chooseTask} task={task}/>)}</div></section> : null}

    {!visibleTasks.length ? <div className="empty-state"><strong>No matching PDF task</strong><p>Try a simpler verb such as edit, pages, protect, convert, compare, or create.</p></div> : null}

    {!query ? <section className="phase2-scope"><strong>Specialist and recovery tools are intentionally not mixed into everyday tasks.</strong><p>Accessibility, print preparation, archive readiness, and Batch remain available above with an Advanced label. Document diagnostics and Repair appear when you search for them or through Help.</p><a href={routeHref({ name: "help" })}>Open Help</a></section> : null}

    <input ref={inputRef} hidden accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; const task = taskRef.current; if (file && task) void openWorkspace(file, task); event.target.value = ""; }} type="file"/>
  </div>;
}

function TaskTile({ task, busy, onChoose }: { task: PdfTask; busy: boolean; onChoose: (task: PdfTask) => void }) {
  const route = task.target.kind === "route" ? taskRoute(task) : null;
  const content = <><span><Icon name={task.icon} size={24}/></span><div><strong>{task.label}</strong><p>{task.description}</p>{task.audience === "advanced" ? <small>Advanced</small> : null}</div></>;
  if (route) return <a className="tool-tile task-tile" href={routeHref(route)}>{content}</a>;
  return <button className="tool-tile task-tile" disabled={busy} onClick={() => onChoose(task)} type="button">{content}</button>;
}
