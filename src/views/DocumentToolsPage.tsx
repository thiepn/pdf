import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Icon } from "../components/Icon";
import { readAppRoute, routeHref } from "../core/appRouter";
import { getTask, pdfTasks, taskCategories, taskRoute, taskSearchText, type PdfTask } from "../ia/taskCatalog";
import "../ia/taskArchitecture.css";
import { ToolboxPage } from "./ToolboxPage";

const relatedTaskIds = new Set(["merge-pdfs", "compare-pdfs", "batch-automation"]);

export function DocumentToolsPage({ projectId, onTitleChange }: { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }) {
  const route = readAppRoute();
  const selectedTask = getTask(route.name === "workspace" ? route.taskId : undefined);
  const selectedUtility = selectedTask?.target.kind === "workspace" && selectedTask.target.mode === "toolbox" ? selectedTask : undefined;
  const [query, setQuery] = useState(() => selectedTask?.label ?? "");
  const [utilitiesOpen, setUtilitiesOpen] = useState(() => Boolean(selectedUtility));

  useEffect(() => {
    onTitleChange?.("Tools", selectedTask ? selectedTask.label : "Find a PDF task by outcome");
    if (selectedUtility) setUtilitiesOpen(true);
  }, [onTitleChange, selectedTask, selectedUtility]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const tasks = pdfTasks.filter((task) => task.target.kind === "workspace" && task.audience !== "recovery");
    return needle ? tasks.filter((task) => taskSearchText(task).includes(needle)) : tasks;
  }, [query]);

  const recovery = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const tasks = pdfTasks.filter((task) => task.target.kind === "workspace" && task.audience === "recovery");
    return needle ? tasks.filter((task) => taskSearchText(task).includes(needle)) : [];
  }, [query]);

  const related = pdfTasks.filter((task) => relatedTaskIds.has(task.id));

  return <div className="document-tools-hub">
    <section className="document-tools-hub__hero"><div><p className="eyebrow">Current PDF</p><h2>{selectedTask ? selectedTask.label : "What do you want to do?"}</h2><p>{selectedTask?.description ?? "Choose the task. PDF Studio opens the correct workspace; specialist engines no longer need to be remembered as navigation tabs."}</p></div><label><span className="visually-hidden">Search current PDF tasks</span><input onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search crop, redact, OCR, metadata…" type="search" value={query}/></label></section>

    {selectedUtility ? <section className="task-focus" aria-label="Selected document utility"><div><span className="task-focus__icon"><Icon name={selectedUtility.icon} size={26}/></span><div><p className="eyebrow">Selected task</p><h2>{selectedUtility.label}</h2><p>{selectedUtility.description} The matching document utilities are open below.</p></div></div><button className="button button--secondary" onClick={() => setQuery("")} type="button">Browse all tasks</button></section> : null}

    {taskCategories.map((category) => {
      const tasks = visible.filter((task) => task.category === category.id);
      if (!tasks.length) return null;
      return <section className="document-task-section" key={category.id}><header><div><p className="eyebrow">{category.label}</p><h3>{category.description}</h3></div></header><div className="document-task-grid">{tasks.map((task) => <DocumentTask key={task.id} onUtilities={() => setUtilitiesOpen(true)} projectId={projectId} task={task}/>)}</div></section>;
    })}

    {recovery.length ? <section className="document-task-section"><header><div><p className="eyebrow">Troubleshoot this PDF</p><h3>Diagnosis and repair are shown only when you search for them.</h3></div></header><div className="document-task-grid">{recovery.map((task) => <DocumentTask key={task.id} onUtilities={() => setUtilitiesOpen(true)} projectId={projectId} task={task}/>)}</div></section> : null}

    {!visible.length && !recovery.length ? <div className="empty-state"><strong>No matching task</strong><p>Try edit, pages, protect, convert, accessibility, or print.</p></div> : null}

    {!query ? <section className="document-task-section"><header><div><p className="eyebrow">Related workflows</p><h3>Actions that open a separate multi-document or automation workspace.</h3></div></header><div className="document-task-grid">{related.map((task) => <DocumentTask key={task.id} onUtilities={() => setUtilitiesOpen(true)} projectId={projectId} task={task}/>)}</div></section> : null}

    <details className="document-utilities-disclosure" onToggle={(event) => setUtilitiesOpen(event.currentTarget.open)} open={utilitiesOpen}>
      <summary><span><strong>Document utilities</strong><small>Watermarks, page numbers, crop, blank pages, metadata, grayscale, and content export</small></span><span aria-hidden="true">⌄</span></summary>
      <div className="document-utilities-disclosure__body"><ToolboxPage projectId={projectId} /></div>
    </details>
  </div>;
}

function DocumentTask({ task, projectId, onUtilities }: { task: PdfTask; projectId: string; onUtilities: () => void }) {
  if (task.target.kind === "workspace" && task.target.mode === "toolbox") {
    return <button className="document-task-card" onClick={onUtilities} type="button"><Icon name={task.icon}/><span><strong>{task.label}</strong><small>{task.description}</small>{task.audience === "advanced" ? <em>Advanced</em> : null}</span></button>;
  }
  const route = taskRoute(task, projectId);
  if (!route) return null;
  return <a className="document-task-card" href={routeHref(route)}><Icon name={task.icon}/><span><strong>{task.label}</strong><small>{task.description}</small>{task.audience === "advanced" ? <em>Advanced</em> : null}</span></a>;
}
