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
  const [query, setQuery] = useState("");

  useEffect(() => {
    onTitleChange?.("Tools", selectedTask ? selectedTask.label : "Find a PDF task by outcome");
  }, [onTitleChange, selectedTask]);

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

  if (selectedUtility) {
    return <div className="document-tools-hub document-tools-hub--focused">
      <section className="task-focus task-focus--workflow" aria-label="Selected document task"><div><span className="task-focus__icon"><Icon name={selectedUtility.icon} size={26}/></span><div><p className="eyebrow">Current PDF</p><h2>{selectedUtility.label}</h2><p>{selectedUtility.description}</p></div></div><a className="button button--secondary" href={routeHref({ name: "workspace", projectId, mode: "toolbox" })}>Back to all PDF tasks</a></section>
      <ToolboxPage initialTaskId={selectedUtility.id} projectId={projectId} />
    </div>;
  }

  return <div className="document-tools-hub">
    <section className="document-tools-hub__hero"><div><p className="eyebrow">Current PDF</p><h2>What do you want to do?</h2><p>Choose an outcome. The matching controls open directly; you do not need to know which PDF engine implements the task.</p></div><label><span className="visually-hidden">Search current PDF tasks</span><input onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search crop, redact, OCR, metadata…" type="search" value={query}/></label></section>

    {taskCategories.map((category) => {
      const tasks = visible.filter((task) => task.category === category.id);
      if (!tasks.length) return null;
      return <section className="document-task-section" key={category.id}><header><div><p className="eyebrow">{category.label}</p><h3>{category.description}</h3></div></header><div className="document-task-grid">{tasks.map((task) => <DocumentTask key={task.id} projectId={projectId} task={task}/>)}</div></section>;
    })}

    {recovery.length ? <section className="document-task-section"><header><div><p className="eyebrow">Troubleshoot this PDF</p><h3>Diagnosis and repair appear only when you search for them.</h3></div></header><div className="document-task-grid">{recovery.map((task) => <DocumentTask key={task.id} projectId={projectId} task={task}/>)}</div></section> : null}

    {!visible.length && !recovery.length ? <div className="empty-state"><strong>No matching task</strong><p>Try edit, pages, protect, convert, compare, or create.</p></div> : null}

    {!query ? <section className="document-task-section"><header><div><p className="eyebrow">Related workflows</p><h3>Multi-document and repeatable workflows.</h3></div></header><div className="document-task-grid">{related.map((task) => <DocumentTask key={task.id} projectId={projectId} task={task}/>)}</div></section> : null}
  </div>;
}

function DocumentTask({ task, projectId }: { task: PdfTask; projectId: string }) {
  if (task.target.kind === "workspace" && task.target.mode === "toolbox") {
    return <a className="document-task-card" href={routeHref({ name: "workspace", projectId, mode: "toolbox", taskId: task.id })}><Icon name={task.icon}/><span><strong>{task.label}</strong><small>{task.description}</small>{task.audience === "advanced" ? <em>Advanced</em> : null}</span></a>;
  }
  const route = taskRoute(task, projectId);
  if (!route) return null;
  return <a className="document-task-card" href={routeHref(route)}><Icon name={task.icon}/><span><strong>{task.label}</strong><small>{task.description}</small>{task.audience === "advanced" ? <em>Advanced</em> : null}</span></a>;
}