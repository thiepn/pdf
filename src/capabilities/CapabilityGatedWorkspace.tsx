import { useEffect, useState } from "react";
import { navigateTo } from "../core/appRouter";
import { recordDiagnosticError } from "../diagnostics/errorRepository";
import { getTask } from "../ia/taskCatalog";
import { TaskIntentRouteBridge } from "../ia/TaskIntentRouteBridge";
import type { WorkspaceMode } from "../types/workspace";
import { UnifiedWorkspace } from "../workspace/UnifiedWorkspace";
import { TaskCapabilityBlocker, TaskCapabilityNotice } from "./TaskCapabilityStatus";
import {
  buildTaskCapabilityContext,
  canStartTask,
  evaluateTaskCapability,
  taskNeedsDeepSecurityInspection,
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
    void (async () => {
      try {
        const cheapContext = await buildTaskCapabilityContext(projectId);
        if (cancelled) return;
        const cheapCapability = evaluateTaskCapability(task, cheapContext);

        // Cheap manifest/editor evidence is authoritative when it already proves
        // the task cannot start. Do not spin up a security worker just to reach
        // the same answer (for example a PDF with zero form widgets).
        if (!canStartTask(cheapCapability) || !taskNeedsDeepSecurityInspection(task)) {
          setCapability(cheapCapability);
          return;
        }

        // Deep safety inspection remains a hard gate for the destructive/protect
        // tasks that require document evidence. Recovery P4 keeps the surrounding
        // workspace responsive while this runs; securityClient reuses the completed
        // report when Protect mounts, so the gate no longer causes a second worker
        // inspection of the same immutable project bytes.
        const deepContext = await buildTaskCapabilityContext(projectId, { inspectSecurity: true });
        if (!cancelled) setCapability(evaluateTaskCapability(task, deepContext));
      } catch (reason) {
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
      }
    })();
    return () => { cancelled = true; };
  }, [mode, projectId, task]);

  if (task && !capability) {
    return <div className="capability-gated-workspace capability-gated-workspace--checking">
      <div className="task-capability-loading task-capability-loading--route" role="status"><span className="spinner"/><strong>Checking whether {task.label} is supported for this PDF…</strong><small>You can keep reading or switch tools while this local check finishes.</small></div>
      <UnifiedWorkspace mode="viewer" onTitleChange={onTitleChange} projectId={projectId} />
    </div>;
  }

  if (task && capability && !canStartTask(capability)) {
    return <TaskCapabilityBlocker
      capability={capability}
      onBack={() => navigateTo({ name: "workspace", projectId, mode: "toolbox" })}
      projectId={projectId}
      taskLabel={task.label}
    />;
  }

  // Keep the same wrapper/component position for taskless and supported task
  // routes. This lets React update UnifiedWorkspace in place instead of tearing
  // down and reacquiring the same project lease during normal task navigation.
  return <div className="capability-gated-workspace">
    <TaskIntentRouteBridge taskId={task?.id} />
    {task && capability ? <TaskCapabilityNotice capability={capability} /> : null}
    <UnifiedWorkspace mode={mode} onTitleChange={onTitleChange} projectId={projectId} />
  </div>;
}
