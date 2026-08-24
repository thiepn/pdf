import { useEffect, useState } from "react";
import { navigateTo } from "../core/appRouter";
import { getTask } from "../ia/taskCatalog";
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

        const deepContext = await buildTaskCapabilityContext(projectId, { inspectSecurity: true });
        if (!cancelled) setCapability(evaluateTaskCapability(task, deepContext));
      } catch (reason) {
        if (cancelled) return;
        setCapability({
          state: "temporarily-unavailable",
          label: "Support check failed",
          reason: `PDF Studio could not verify whether this task is safe to start: ${reason instanceof Error ? reason.message : String(reason)}`,
          recovery: "Return to Tools and retry after the document finishes opening."
        });
      }
    })();
    return () => { cancelled = true; };
  }, [mode, projectId, task]);

  if (task && !capability) {
    return <div className="task-capability-loading task-capability-loading--route" role="status"><span className="spinner"/><strong>Checking whether {task.label} is supported for this PDF…</strong></div>;
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
    {task && capability ? <TaskCapabilityNotice capability={capability} /> : null}
    <UnifiedWorkspace mode={mode} onTitleChange={onTitleChange} projectId={projectId} />
  </div>;
}
