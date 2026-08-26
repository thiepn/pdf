import { recordRuntimeMetric } from "../performance/runtimeMetrics";
import type { NativeInspection } from "../types/nativeEditor";
import * as base from "./nativeClientBase";

export * from "./nativeClientBase";

interface InspectionEntry {
  promise: Promise<NativeInspection>;
  controller: AbortController;
  settled: boolean;
  cancellableWaiters: number;
  uncancellableWaiters: number;
}

const inspectionsByBytes = new WeakMap<Uint8Array, Map<string, InspectionEntry>>();

function inspectionKey(password?: string): string {
  return password ? `protected:${password}` : "unprotected";
}

function abortError(): DOMException {
  return new DOMException("Inspection cancelled.", "AbortError");
}

function maybeAbortUnused(entry: InspectionEntry, sessions: Map<string, InspectionEntry>, key: string): void {
  if (entry.settled || entry.cancellableWaiters || entry.uncancellableWaiters) return;
  entry.controller.abort();
  sessions.delete(key);
}

function waitWithSignal(
  entry: InspectionEntry,
  sessions: Map<string, InspectionEntry>,
  key: string,
  signal: AbortSignal
): Promise<NativeInspection> {
  if (signal.aborted) return Promise.reject(abortError());
  entry.cancellableWaiters += 1;
  return new Promise<NativeInspection>((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      signal.removeEventListener("abort", onAbort);
      entry.cancellableWaiters = Math.max(0, entry.cancellableWaiters - 1);
      return true;
    };
    const onAbort = () => {
      if (!finish()) return;
      reject(abortError());
      maybeAbortUnused(entry, sessions, key);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    entry.promise.then(
      (inspection) => { if (finish()) resolve(inspection); },
      (reason) => { if (finish()) reject(reason); }
    );
  });
}

/**
 * Recovery P2/P3 reuses one MuPDF inspection for immutable project bytes while
 * allowing deferred-hydration consumers to cancel. If the last pending consumer
 * leaves before inspection finishes, the shared worker chain is aborted; a
 * completed inspection remains cached for later Edit sessions.
 */
export async function inspectNativePdf(bytes: Uint8Array, password?: string, signal?: AbortSignal): Promise<NativeInspection> {
  let sessions = inspectionsByBytes.get(bytes);
  if (!sessions) {
    sessions = new Map();
    inspectionsByBytes.set(bytes, sessions);
  }
  const key = inspectionKey(password);
  let entry = sessions.get(key);
  if (entry) {
    recordRuntimeMetric("worker", "mupdf.inspection.session.hit", 0, undefined, {
      byteLength: bytes.byteLength,
      passwordProtected: Boolean(password)
    });
  } else {
    const controller = new AbortController();
    entry = {
      promise: Promise.resolve(undefined as unknown as NativeInspection),
      controller,
      settled: false,
      cancellableWaiters: 0,
      uncancellableWaiters: 0
    };
    const current = entry;
    current.promise = base.inspectNativePdf(bytes, password, controller.signal)
      .then((inspection) => {
        current.settled = true;
        return inspection;
      })
      .catch((reason) => {
        current.settled = true;
        sessions!.delete(key);
        throw reason;
      });
    sessions.set(key, current);
    recordRuntimeMetric("worker", "mupdf.inspection.session.miss", 0, undefined, {
      byteLength: bytes.byteLength,
      passwordProtected: Boolean(password)
    });
  }

  if (signal) return waitWithSignal(entry, sessions, key, signal);
  entry.uncancellableWaiters += 1;
  try {
    return await entry.promise;
  } finally {
    entry.uncancellableWaiters = Math.max(0, entry.uncancellableWaiters - 1);
  }
}
