import { recordRuntimeMetric } from "./runtimeMetrics";

export interface DeferredHydrationHandle {
  signal: AbortSignal;
  cancel(): void;
}

export interface DeferredHydrationOptions {
  timeoutMs?: number;
  label?: string;
  /**
   * Non-critical enrichment should not compete with a user who immediately
   * starts scrolling, dragging, typing, or zooming. The task is allowed to
   * enter the browser idle queue only after this quiet window has elapsed.
   */
  quietPeriodMs?: number;
}

type IdleDeadlineLike = { didTimeout: boolean; timeRemaining(): number };
type RequestIdle = (callback: (deadline: IdleDeadlineLike) => void, options?: { timeout: number }) => number;
type CancelIdle = (handle: number) => void;

/**
 * Run non-critical document enrichment only after the browser has had a chance
 * to paint the interactive document surface and the user has stopped actively
 * manipulating it. requestIdleCallback is preferred, with a bounded timeout
 * fallback for engines that do not expose it.
 */
export function scheduleDeferredHydration(
  task: (signal: AbortSignal) => void | Promise<void>,
  options: DeferredHydrationOptions = {}
): DeferredHydrationHandle {
  const controller = new AbortController();
  const timeoutMs = Math.max(250, options.timeoutMs ?? 1_500);
  const quietPeriodMs = Math.max(0, options.quietPeriodMs ?? 700);
  const label = options.label ?? "document";
  let frameOne: number | null = null;
  let frameTwo: number | null = null;
  let idleHandle: number | null = null;
  let fallbackTimer: number | null = null;
  let quietTimer: number | null = null;
  let listeningForActivity = false;
  let started = false;

  const cancelIdlePending = () => {
    if (idleHandle !== null) {
      const cancelIdle = (globalThis as typeof globalThis & { cancelIdleCallback?: CancelIdle }).cancelIdleCallback;
      cancelIdle?.(idleHandle);
      idleHandle = null;
    }
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const detachActivityListeners = () => {
    if (!listeningForActivity || typeof window === "undefined") return;
    listeningForActivity = false;
    for (const type of activityEvents) window.removeEventListener(type, onActivity, true);
  };

  const clearPending = () => {
    if (frameOne !== null) cancelAnimationFrame(frameOne);
    if (frameTwo !== null) cancelAnimationFrame(frameTwo);
    frameOne = frameTwo = null;
    cancelIdlePending();
    if (quietTimer !== null) {
      clearTimeout(quietTimer);
      quietTimer = null;
    }
    detachActivityListeners();
  };

  const run = () => {
    if (started || controller.signal.aborted) return;
    started = true;
    clearPending();
    recordRuntimeMetric("custom", `readiness.${label}.hydration-start`, 0);
    void Promise.resolve(task(controller.signal)).catch(() => undefined);
  };

  const scheduleIdle = () => {
    if (controller.signal.aborted || started) return;
    if (quietTimer !== null) {
      clearTimeout(quietTimer);
      quietTimer = null;
    }
    const requestIdle = (globalThis as typeof globalThis & { requestIdleCallback?: RequestIdle }).requestIdleCallback;
    if (requestIdle) {
      idleHandle = requestIdle(() => run(), { timeout: timeoutMs });
    } else {
      fallbackTimer = globalThis.setTimeout(run, Math.min(timeoutMs, 50));
    }
  };

  const scheduleAfterQuietPeriod = () => {
    if (controller.signal.aborted || started) return;
    if (quietPeriodMs <= 0) {
      scheduleIdle();
      return;
    }
    if (typeof window !== "undefined" && !listeningForActivity) {
      listeningForActivity = true;
      for (const type of activityEvents) window.addEventListener(type, onActivity, { capture: true, passive: true });
    }
    if (quietTimer !== null) clearTimeout(quietTimer);
    quietTimer = globalThis.setTimeout(scheduleIdle, quietPeriodMs);
  };

  function onActivity(event: Event): void {
    if (controller.signal.aborted || started) return;
    // Hovering the pointer is not meaningful activity. A pointer move only
    // postpones enrichment while a button is held, i.e. during a drag/draw.
    if (event.type === "pointermove" && event instanceof PointerEvent && event.buttons === 0) return;
    cancelIdlePending();
    if (quietTimer !== null) clearTimeout(quietTimer);
    quietTimer = globalThis.setTimeout(scheduleIdle, quietPeriodMs);
  }

  const activityEvents = ["pointerdown", "pointermove", "pointerup", "wheel", "scroll", "keydown", "touchstart", "touchmove"] as const;

  if (typeof requestAnimationFrame === "function") {
    frameOne = requestAnimationFrame(() => {
      frameOne = null;
      frameTwo = requestAnimationFrame(() => {
        frameTwo = null;
        scheduleAfterQuietPeriod();
      });
    });
  } else {
    fallbackTimer = globalThis.setTimeout(scheduleAfterQuietPeriod, 0);
  }

  return {
    signal: controller.signal,
    cancel() {
      controller.abort();
      clearPending();
    }
  };
}
