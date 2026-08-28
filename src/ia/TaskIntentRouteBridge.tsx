import { useEffect, useState } from "react";
import { recordDiagnosticError } from "../diagnostics/errorRepository";
import { taskIntentActivation } from "./taskIntent";

interface Props {
  taskId?: string;
}

const ACTIVATION_TIMEOUT_MS = 15_000;

function normalizedLabel(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function findIntentButton(selector: string, label: string): HTMLButtonElement | undefined {
  const expected = normalizedLabel(label);
  return Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).find((button) => {
    const accessibleName = button.getAttribute("aria-label") || button.textContent;
    return !button.disabled && normalizedLabel(accessibleName) === expected;
  });
}

/**
 * Focused P0 compatibility bridge for specialist workspaces that predate the
 * canonical task router. It activates the exact existing tab/tool through that
 * control's real click handler, so task links do not collapse into a generic
 * workspace default while the underlying workspaces are incrementally typed.
 */
export function TaskIntentRouteBridge({ taskId }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const activation = taskIntentActivation(taskId);
    setFailed(false);
    if (!taskId || !activation) return;

    let complete = false;
    let frame = 0;
    const root = document.getElementById("main-workspace") ?? document.body;
    const observer = new MutationObserver(() => {
      if (activate()) observer.disconnect();
    });
    const activate = (): boolean => {
      const button = findIntentButton(activation.selector, activation.label);
      if (!button) return false;
      const alreadyActive = button.classList.contains("active") || button.getAttribute("aria-current") === "page";
      if (!alreadyActive) button.click();
      document.documentElement.dataset.pdfTaskIntent = taskId;
      complete = true;
      return true;
    };

    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled"] });
    frame = window.requestAnimationFrame(() => {
      if (activate()) observer.disconnect();
    });

    const timeout = window.setTimeout(() => {
      observer.disconnect();
      if (complete) return;
      setFailed(true);
      void recordDiagnosticError(new Error(`Task intent could not activate ${activation.label}.`), {
        area: "task-intent",
        operation: `activate:${taskId}`,
        route: window.location.hash,
        severity: "warning",
        recoverable: true
      });
    }, ACTIVATION_TIMEOUT_MS);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      observer.disconnect();
      if (document.documentElement.dataset.pdfTaskIntent === taskId) delete document.documentElement.dataset.pdfTaskIntent;
    };
  }, [taskId]);

  if (!failed || !taskId) return null;
  return <div className="warning-banner" role="status"><strong>Task focus could not be restored</strong><span>The workspace opened safely, but its requested control was not found. Choose the task tab manually or return to Tools.</span></div>;
}
