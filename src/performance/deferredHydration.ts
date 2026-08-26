import { recordRuntimeMetric } from "./runtimeMetrics";

export interface DeferredHydrationHandle {
  signal: AbortSignal;
  cancel(): void;
}

export interface DeferredHydrationOptions {
  timeoutMs?: number;
  label?: string;
}

type IdleDeadlineLike = { didTimeout: boolean; timeRemaining(): number };
type RequestIdle = (callback: (deadline: IdleDeadlineLike) => void, options?: { timeout: number }) => number;
type CancelIdle = (handle: number) => void;

/**
 * Run non-critical document enrichment only after the browser has had a chance
 * to paint the interactive document surface. requestIdleCallback is preferred,
 * with a bounded timeout fallback for engines that do not expose it.
 */
export function scheduleDeferredHydration(
  task: (signal: AbortSignal) => void | Promise<void>,
  options: DeferredHydrationOptions = {}
): DeferredHydrationHandle {
  const controller = new AbortController();
  const timeoutMs = Math.max(250, options.timeoutMs ?? 1_500);
  const label = options.label ?? "document";
  let frameOne: number | null = null;
  let frameTwo: number | null = null;
  let idleHandle: number | null = null;
  let fallbackTimer: number | null = null;
  let started = false;

  const clearPending = () => {
    if (frameOne !== null) cancelAnimationFrame(frameOne);
    if (frameTwo !== null) cancelAnimationFrame(frameTwo);
    frameOne = frameTwo = null;
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

  const run = () => {
    if (started || controller.signal.aborted) return;
    started = true;
    clearPending();
    recordRuntimeMetric("custom", `readiness.${label}.hydration-start`, 0);
    void Promise.resolve(task(controller.signal)).catch(() => undefined);
  };

  const scheduleIdle = () => {
    if (controller.signal.aborted) return;
    const requestIdle = (globalThis as typeof globalThis & { requestIdleCallback?: RequestIdle }).requestIdleCallback;
    if (requestIdle) {
      idleHandle = requestIdle(() => run(), { timeout: timeoutMs });
    } else {
      fallbackTimer = globalThis.setTimeout(run, Math.min(timeoutMs, 50));
    }
  };

  if (typeof requestAnimationFrame === "function") {
    frameOne = requestAnimationFrame(() => {
      frameOne = null;
      frameTwo = requestAnimationFrame(() => {
        frameTwo = null;
        scheduleIdle();
      });
    });
  } else {
    fallbackTimer = globalThis.setTimeout(scheduleIdle, 0);
  }

  return {
    signal: controller.signal,
    cancel() {
      controller.abort();
      clearPending();
    }
  };
}
