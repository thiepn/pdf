import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Icon } from "../components/Icon";
import { readAppRoute, routeHref } from "../core/appRouter";
import { getTask, pdfTasks, taskCategories, taskRoute, taskSearchText, type PdfTask } from "../ia/taskCatalog";
import { buildTaskCapabilityContext, evaluateTaskCapability, isCapabilityBlocked, type TaskCapability, type TaskCapabilityContext } from "../capabilities/taskCapability";
import { TaskCapabilityBlocker, TaskCapabilityChip } from "../capabilities/TaskCapabilityStatus";
import "../ia/taskArchitecture.css";
import { ToolboxPage } from "./ToolboxPage";

const relatedTaskIds = new Set(["merge-pdfs", "compare-pdfs", "batch-automation"]);

export function DocumentToolsPage({ projectId, onTitleChange }: { projectId: string; onTitleChange?: (title: string, subtitle?: string) => void }) {
  const route = readAppRoute();
  const selectedTask = getTask(route.name === "workspace" ? route.taskId : undefined);
  const selectedUtility = selectedTask?.target.kind === "workspace" && selectedTask.target.mode === "toolbox" ? selectedTask : undefined;
  const [query, setQuery] = useState("");
  const [capabilityContext, setCapabilityContext] = useState<TaskCapabilityContext | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);

  useEffect(() => {
    onTitleChange?.("Tools", selectedTask ? selectedTask.label : "Find a PDF task by outcome");
  }, [onTitleChange, selectedTask]);

  useEffect(() => {
    let cancelled = false;
    setCapabilityContext(null);
    setCapabilityError(null);
    void buildTaskCapabilityContext(projectId)
      .then((context) => { if (!cancelled) setCapabilityContext(context); })
      .catch((reason) => { if (!cancelled) setCapabilityError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [projectId]);

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
  const capabilityFor = (task: PdfTask): TaskCapability | null => capabilityContext ? evaluateTaskCapability(task, capabilityContext) : null;

  if (selectedUtility) {
    if (capabilityError) return <TaskCapabilityBlocker capability={{ state: "temporarily-unavailable", label: "Support check failed", reason: capabilityError, recovery: "Return to Tools and try again." }} onBack={() => { window.location.hash = routeHref({ name: "workspace", projectId, mode: "toolbox" }).slice(1); }} projectId={projectId} taskLabel={selectedUtility.label} />;
    if (!capabilityContext) return <div className="task-capability-loading task-capability-loading--route" role="status"><span className="spinner"/><strong>Checking whether {selectedUtility.label} is supported for this PDF…</strong></div>;
    const capability = evaluateTaskCapability(selectedUtility, capabilityContext);
    if (isCapabilityBlocked(capability)) return <TaskCapabilityBlocker capability={capability} onBack={() => { window.location.hash = routeHref({ name: "workspace", projectId, mode: "toolbox" }).slice(1); }} projectId={projectId} taskLabel={selectedUtility.label} />;
    return <div className="document-tools-hub document-tools-hub--focused">
      <section className="task-focus task-focus--workflow" aria-label="Selected document task"><div><span className="task-focus__icon"><Icon name={selectedUtility.icon} size={26}/></span><div><p className="eyebrow">Current PDF</p><h2>{selectedUtility.label}</h2><p>{selectedUtility.description}</p><TaskCapabilityChip capability={capability}/></div></div><a className="button button--secondary" href={routeHref({ name: "workspace", projectId, mode: "toolbox" })}>Back to all PDF tasks</a></section>
      <ToolboxPage initialTaskId={selectedUtility.id} projectId={projectId} />
    </div>;
  }

  return <div className="document-tools-hub">
    <section className="document-tools-hub__hero"><div><p className="eyebrow">Current PDF</p><h2>What do you want to do?</h2><p>Choose an outcome. PDF Studio checks known document requirements before a task can start.</p></div><label><span className="visually-hidden">Search current PDF tasks</span><input onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search crop, redact, OCR, metadata…" type="search" value={query}/></label></section>

    {capabilityError ? <div className="error-banner"><strong>Could not check task support</strong><span>{capabilityError}</span></div> : null}
    {!capabilityContext && !capabilityError ? <div className="task-capability-loading" role="status"><span className="spinner"/><strong>Checking which tools this PDF supports…</strong></div> : null}

    {capabilityContext ? taskCategories.map((category) => {
      const tasks = visible.filter((task) => task.category === category.id).filter((task) => capabilityFor(task)?.state !== "hidden");
      if (!tasks.length) return null;
      return <section className="document-task-section" key={category.id}><header><div><p className="eyebrow">{category.label}</p><h3>{category.description}</h3></div></header><div className="document-task-grid">{tasks.map((task) => <DocumentTask capability={capabilityFor(task) as TaskCapability} key={task.id} projectId={projectId} task={task}/>)}</div></section>;
    }) : null}

    {capabilityContext && recovery.length ? <section className="document-task-section"><header><div><p className="eyebrow">Troubleshoot this PDF</p><h3>Diagnosis and repair appear only when you search for them.</h3></div></header><div className="document-task-grid">{recovery.map((task) => <DocumentTask capability={capabilityFor(task) as TaskCapability} key={task.id} projectId={projectId} task={task}/>)}</div></section> : null}

    {capabilityContext && !visible.length && !recovery.length ? <div className="empty-state"><strong>No matching task</strong><p>Try edit, pages, protect, convert, compare, or create.</p></div> : null}

    {capabilityContext && !query ? <section className="document-task-section"><header><div><p className="eyebrow">Related workflows</p><h3>Multi-document and repeatable workflows.</h3></div></header><div className="document-task-grid">{related.map((task) => <DocumentTask capability={capabilityFor(task) ?? { state: "available", label: "Ready" }} key={task.id} projectId={projectId} task={task}/>)}</div></section> : null}
  </div>;
}

function DocumentTask({ task, projectId, capability }: { task: PdfTask; projectId: string; capability: TaskCapability }) {
  if (capability.state === "hidden") return null;
  const blocked = isCapabilityBlocked(capability);
  const content = <><Icon name={task.icon}/><span><strong>{task.label}</strong><small>{task.description}</small><TaskCapabilityChip capability={capability}/>{capability.reason && capability.state !== "available" ? <small className="task-capability-reason">{capability.reason}</small> : null}{capability.recovery && blocked ? <small className="task-capability-recovery">{capability.recovery}</small> : null}{task.audience === "advanced" && capability.state === "available" ? <em>Advanced</em> : null}</span></>;
  if (blocked) return <button aria-disabled="true" className="document-task-card document-task-card--blocked" disabled type="button">{content}</button>;
  if (task.target.kind === "workspace" && task.target.mode === "toolbox") {
    return <a className="document-task-card" href={routeHref({ name: "workspace", projectId, mode: "toolbox", taskId: task.id })}>{content}</a>;
  }
  const route = taskRoute(task, projectId);
  if (!route) return null;
  return <a className="document-task-card" href={routeHref(route)}>{content}</a>;
}
