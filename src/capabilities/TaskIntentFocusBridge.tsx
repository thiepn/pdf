import { useEffect, useRef } from "react";
import { TASK_INTENT_FOCUS_PLANS, type TaskIntentFocusTarget } from "./taskIntentFocus";

interface Props {
  taskId: string;
}

/**
 * Recovery bridge for canonical tasks that share one broad workspace component.
 * It activates the exact tab/tool only after the lazy workspace has mounted.
 * The task contract remains keyed by stable task IDs; labels/selectors are covered
 * by regression tests so a future UI rename cannot silently restore default-tab
 * routing.
 */
export function TaskIntentFocusBridge({ taskId }: Props) {
  const markerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const plan = TASK_INTENT_FOCUS_PLANS[taskId];
    const root = markerRef.current?.parentElement;
    if (!plan || !root) return;

    let primaryApplied = false;
    let done = false;
    let observer: MutationObserver | null = null;

    const finish = () => {
      done = true;
      observer?.disconnect();
    };

    const findTarget = (target: TaskIntentFocusTarget): HTMLElement | null => {
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(target.selector));
      if (!target.label) return candidates[0] ?? null;
      return candidates.find((element) => {
        const aria = element.getAttribute("aria-label")?.trim();
        const strong = element.querySelector("strong")?.textContent?.trim();
        const text = element.textContent?.trim();
        return aria === target.label || strong === target.label || text === target.label;
      }) ?? null;
    };

    const applyTarget = (element: HTMLElement, target: TaskIntentFocusTarget) => {
      if (target.action !== "focus") element.click();
      const focusTarget = element.matches("button,input,select,textarea,[tabindex]")
        ? element
        : element.querySelector<HTMLElement>("button,input,select,textarea,[tabindex]");
      focusTarget?.focus({ preventScroll: true });
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
    };

    const apply = () => {
      if (done) return;
      if (!primaryApplied) {
        const primary = findTarget(plan.primary);
        if (!primary) return;
        applyTarget(primary, plan.primary);
        primaryApplied = true;
        if (!plan.followUp) {
          finish();
          return;
        }
      }

      if (plan.followUp) {
        const followUp = findTarget(plan.followUp);
        if (!followUp) return;
        applyTarget(followUp, plan.followUp);
        finish();
      }
    };

    observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    apply();
    return () => observer?.disconnect();
  }, [taskId]);

  return <span aria-hidden="true" data-task-intent-focus={taskId} hidden ref={markerRef} />;
}
