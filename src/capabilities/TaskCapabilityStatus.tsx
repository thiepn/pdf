import { routeHref } from "../core/appRouter";
import { getTask, taskRoute } from "../ia/taskCatalog";
import type { TaskCapability } from "./taskCapability";
import "./capability.css";

export function TaskCapabilityChip({ capability }: { capability: TaskCapability }) {
  if (capability.state === "available" || capability.state === "hidden") return null;
  return <span className={`task-capability-chip task-capability-chip--${capability.state}`}>{capability.label}</span>;
}

export function TaskCapabilityNotice({ capability }: { capability: TaskCapability }) {
  if (capability.state !== "available-with-warning" && capability.state !== "experimental") return null;
  return <section className={`task-capability-notice task-capability-notice--${capability.state}`} role="status">
    <div><strong>{capability.label}</strong>{capability.reason ? <span>{capability.reason}</span> : null}</div>
    {capability.recovery ? <small>{capability.recovery}</small> : null}
  </section>;
}

export function TaskCapabilityBlocker({
  taskLabel,
  capability,
  projectId,
  onBack
}: {
  taskLabel: string;
  capability: TaskCapability;
  projectId?: string;
  onBack?: () => void;
}) {
  const alternative = capability.alternativeTaskId ? getTask(capability.alternativeTaskId) : undefined;
  const alternativeRoute = alternative ? taskRoute(alternative, projectId) : null;
  return <section className="task-capability-blocker" aria-live="polite">
    <p className="eyebrow">{capability.label}</p>
    <h2>{taskLabel} cannot start for this document</h2>
    {capability.reason ? <p>{capability.reason}</p> : null}
    {capability.recovery ? <p className="muted">{capability.recovery}</p> : null}
    <div className="task-capability-blocker__actions">
      {alternative && alternativeRoute ? <a className="button" href={routeHref(alternativeRoute)}>Open {alternative.label}</a> : null}
      {onBack ? <button className="button button--secondary" onClick={onBack} type="button">Choose another task</button> : null}
    </div>
  </section>;
}
