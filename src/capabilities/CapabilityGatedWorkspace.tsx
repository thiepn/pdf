import { useEffect, useState } from "react";
import { navigateTo } from "../core/appRouter";
import { recordDiagnosticError } from "../diagnostics/errorRepository";
import { getTask } from "../ia/taskCatalog";
import type { WorkspaceMode } from "../types/workspace";
import { UnifiedWorkspace } from "../workspace/UnifiedWorkspace";
import { TaskCapabilityBlocker, TaskCapabilityNotice } from "./TaskCapabilityStatus";
import { TaskIntentFocusBridge } from "./TaskIntentFocusBridge";
import {
  buildTaskCapabilityContext,
  canStartTask,
  evaluateTaskCapability,
  type TaskCapability
} from "./taskCapability";

interface Props {
  projectId: string;
  mode: WorkspaceMode;
  taskId?: string;
  onTitleChange?: (title: string, subtitle?: string) => void;
}

const READY: TaskCapability = { state: "available", label: "Ready" };

export function CapabilityGatedWorkspace({ projectId, mode, taskId, onTitleChange }: Props) {
  const task = getTask(taskId);
  const [capability, setCapability] = useState<TaskCapability | null>(() => task ? null : READY);

  useEffect(() => {
    let cancelled = false;
    if (!task) {
      setCapability(READY);
      return () => { cancelled = true; };
    }
    if (task.target.kind !== "workspace" || task.target.mode !== mode) {
      setCapability({
        state: "temporarily-unavailable",
        label: "Task link is invalid",
        reason: "This task link does not match the workspace it is trying to open.",
        recovery: "Return to Tools and choose the task again."
      });
      return () => { cancelled = true; };
    }

    setCapability(null);
    void buildTaskCapabilityContext(projectId)
      .then((context) => {
        if (!cancelled) setCapability(evaluateTaskCapability(task, context));
      })
      .catch((reason) => {
        if (cancelled) return;
        void recordDiagnosticError(reason, {
          area: "capability",
          operation: `preflight:${task.id}`,
          route: window.location.hash,
          projectId,
          severity: "warning",
          recoverable: true
        });
        setCapability({
          state: "temporarily-unavailable",
          label: "Safety check unavailable",
          reason: "PDF Studio could not finish the document safety check, so this task was not allowed to start.",
          recovery: "Wait for the PDF to finish opening and retry. If the check keeps failing, open Troubleshooting & recovery."
        });
      });
    return () => { cancelled = true; };
  }, [mode, projectId, task]);

  if (task && capability && !canStartTask(capability)) {
    return <TaskCapabilityBlocker
      capability={capability}
      onBack={() => navigateTo({ name: "workspace", projectId, mode: "toolbox" })}
      projectId={projectId}
      taskLabel={task.label}
    />;
  }

  const checking = Boolean(task && !capability);

  // Capability routing stays cheap and deterministic. Heavy security inspection
  // belongs to Protect itself, where it is required for the actual operation and
  // can be reused on later Protect visits. This prevents a task link from paying
  // the same cold Worker/WASM startup twice before the requested workspace opens.
  return <div className={checking ? "capability-gated-workspace capability-gated-workspace--checking" : "capability-gated-workspace"}>
    {checking
      ? <div className="task-capability-loading task-capability-loading--route" key="gate-status" role="status"><span className="spinner"/><strong>Checking whether {task?.label} is supported for this PDF…</strong><small>You can keep reading while this local check finishes.</small></div>
      : task && capability
        ? <TaskCapabilityNotice capability={capability} key="gate-status" />
        : <span aria-hidden="true" hidden key="gate-status" />}
    <UnifiedWorkspace key="workspace" mode={checking ? "viewer" : mode} onTitleChange={onTitleChange} projectId={projectId} />
    {!checking && task ? <TaskIntentFocusBridge key="task-intent" taskId={task.id} /> : null}
  </div>;
}
