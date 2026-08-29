import { recordRuntimeMetric } from "./runtimeMetrics";

export interface DeferredHydrationHandle {
  signal: AbortSignal;
  cancel(): void;
}

export interface DeferredHydrationOptions {
  timeoutMs?: number;
  label?: string;
  /**
   * When the user is actively manipulating the document, non-critical
   * enrichment waits for this quiet window before re-entering the idle queue.
   */
  quietPeriodMs?: number;
  /**
   * Short post-paint grace period that gives immediate user input a chance to
   * preempt enrichment without imposing the full quiet-period cost on idle users.
   */
  initialGraceMs?: number;
}

type IdleDeadlineLike = { didTimeout: boolean; timeRemaining(): number };
type RequestIdle = (callback: (deadline: IdleDeadlineLike) => void, options?: { timeout: number }) => number;
type CancelIdle = (handle: number) => void;

const activityEvents = ["pointerdown", "pointermove", "pointerup", "wheel", "scroll", "keydown", "touchstart", "touchmove"] as const;

/**
 * Run non-critical document enrichment after the browser has painted the
 * interactive surface. A short grace period lets immediate input win; after
 * that, idle users enter the browser idle queue while active users keep
 * postponing enrichment until the configured quiet period has elapsed.
 */
export function scheduleDeferredHydration(
  task: (signal: AbortSignal) => void | Promise<void>,
  options: DeferredHydrationOptions = {}
): DeferredHydrationHandle {
  const controller = new AbortController();
  const timeoutMs = Math.max(250, options.timeoutMs ?? 1_500);
  const quietPeriodMs = Math.max(0, options.quietPeriodMs ?? 700);
  const initialGraceMs = Math.max(0, options.initialGraceMs ?? 250);
  const label = options.label ?? "document";
  let frameOne: number | null = null;
  let frameTwo: number | null = null;
  let idleHandle: number | null = null;
  let fallbackTimer: number | null = null;
  let quietTimer: number | null = null;
  let graceTimer: number | null = null;
  let listeningForActivity = false;
  let started = false;
  let lastActivityAt: number | null = null;

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
    if (graceTimer !== null) {
      clearTimeout(graceTimer);
      graceTimer = null;
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
    cancelIdlePending();
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

  const scheduleWhenInputIsQuiet = () => {
    if (controller.signal.aborted || started) return;
    if (lastActivityAt === null || quietPeriodMs <= 0) {
      scheduleIdle();
      return;
    }
    const remaining = quietPeriodMs - (performance.now() - lastActivityAt);
    if (remaining <= 0) {
      scheduleIdle();
      return;
    }
    if (quietTimer !== null) clearTimeout(quietTimer);
    quietTimer = globalThis.setTimeout(scheduleWhenInputIsQuiet, Math.max(16, remaining));
  };

  function onActivity(event: Event): void {
    if (controller.signal.aborted || started) return;
    // Passive pointer hover should not starve enrichment. Movement only counts
    // while a button is held, i.e. during a drag/draw interaction.
    if (event.type === "pointermove" && event instanceof PointerEvent && event.buttons === 0) return;
    lastActivityAt = performance.now();
    cancelIdlePending();
    if (quietTimer !== null) clearTimeout(quietTimer);
    quietTimer = globalThis.setTimeout(scheduleWhenInputIsQuiet, quietPeriodMs);
  }

  const enterGraceThenIdle = () => {
    if (controller.signal.aborted || started) return;
    if (initialGraceMs <= 0) {
      scheduleWhenInputIsQuiet();
      return;
    }
    graceTimer = globalThis.setTimeout(() => {
      graceTimer = null;
      scheduleWhenInputIsQuiet();
    }, initialGraceMs);
  };

  if (typeof window !== "undefined") {
    listeningForActivity = true;
    for (const type of activityEvents) window.addEventListener(type, onActivity, { capture: true, passive: true });
  }

  if (typeof requestAnimationFrame === "function") {
    frameOne = requestAnimationFrame(() => {
      frameOne = null;
      frameTwo = requestAnimationFrame(() => {
        frameTwo = null;
        enterGraceThenIdle();
      });
    });
  } else {
    fallbackTimer = globalThis.setTimeout(enterGraceThenIdle, 0);
  }

  return {
    signal: controller.signal,
    cancel() {
      controller.abort();
      clearPending();
    }
  };
}
