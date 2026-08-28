import { recordRuntimeMetric } from "../performance/runtimeMetrics";
import type { SecurityExportOptions, SecurityExportReport, SecurityInspectionReport } from "../types/security";

interface Ready { type: "READY" }
interface InspectionSuccess { type: "SECURITY_INSPECTION_RESULT"; requestId: string; report: SecurityInspectionReport }
interface ExportSuccess { type: "SECURITY_EXPORT_RESULT"; requestId: string; output: ArrayBuffer; report: SecurityExportReport }
interface Failure { type: "SECURITY_ERROR"; requestId: string; error: { name: string; message: string } }
type Response = Ready | InspectionSuccess | ExportSuccess | Failure;

interface InspectionEntry {
  promise: Promise<SecurityInspectionReport>;
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
  return new DOMException("Security inspection cancelled.", "AbortError");
}

function runWorker<T>(
  message: Record<string, unknown>,
  source: ArrayBuffer,
  signal: AbortSignal | undefined,
  read: (response: Response) => T | undefined
): Promise<T> {
  const worker = new Worker(new URL("../workers/security-entry.worker.ts", import.meta.url), { type: "module" });
  const requestId = String(message.requestId);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { worker.terminate(); reject(new DOMException("Operation cancelled.", "AbortError")); return; }
    let started = false;
    const cleanup = () => { signal?.removeEventListener("abort", cancel); worker.terminate(); };
    const cancel = () => {
      if (started) worker.postMessage({ type: "CANCEL", requestId });
      cleanup();
      reject(new DOMException("Operation cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<Response>) => {
      if (event.data.type === "READY") {
        if (started || signal?.aborted) return;
        started = true;
        worker.postMessage({ ...message, bytes: source }, [source]);
        return;
      }
      if (event.data.requestId !== requestId) return;
      if (event.data.type === "SECURITY_ERROR") { cleanup(); reject(new Error(event.data.error.message)); return; }
      const value = read(event.data);
      if (value === undefined) return;
      cleanup(); resolve(value);
    };
    worker.onmessageerror = () => { cleanup(); reject(new Error("Security worker returned an unreadable response.")); };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Security worker failed.")); };
  });
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
): Promise<SecurityInspectionReport> {
  if (signal.aborted) {
    maybeAbortUnused(entry, sessions, key);
    return Promise.reject(abortError());
  }
  entry.cancellableWaiters += 1;
  return new Promise<SecurityInspectionReport>((resolve, reject) => {
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
 * Recovery P4 shares immutable-document security inspection between capability
 * preflight and Protect. A completed report remains reusable for the same byte
 * identity and in-memory password; a pending worker is cancelled when its last
 * cancellable consumer leaves. Export/apply operations are never cached.
 */
export async function inspectSecurity(
  bytes: Uint8Array,
  password?: string,
  signal?: AbortSignal
): Promise<SecurityInspectionReport> {
  let sessions = inspectionsByBytes.get(bytes);
  if (!sessions) {
    sessions = new Map();
    inspectionsByBytes.set(bytes, sessions);
  }
  const key = inspectionKey(password);
  let entry = sessions.get(key);

  if (entry) {
    recordRuntimeMetric("worker", "security.inspection.session.hit", 0, undefined, {
      byteLength: bytes.byteLength,
      passwordProtected: Boolean(password)
    });
  } else {
    const controller = new AbortController();
    entry = {
      promise: Promise.resolve(undefined as unknown as SecurityInspectionReport),
      controller,
      settled: false,
      cancellableWaiters: 0,
      uncancellableWaiters: 0
    };
    const current = entry;
    const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const source = Uint8Array.from(bytes).buffer;
    current.promise = runWorker(
      { type: "INSPECT_SECURITY", requestId, password },
      source,
      controller.signal,
      (response) => response.type === "SECURITY_INSPECTION_RESULT" ? response.report : undefined
    ).then((inspection) => {
      current.settled = true;
      return inspection;
    }).catch((reason) => {
      current.settled = true;
      sessions!.delete(key);
      throw reason;
    });
    sessions.set(key, current);
    recordRuntimeMetric("worker", "security.inspection.session.miss", 0, undefined, {
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

export async function applySecurity(
  bytes: Uint8Array,
  options: SecurityExportOptions,
  password?: string,
  signal?: AbortSignal
): Promise<{ bytes: Uint8Array; report: SecurityExportReport }> {
  const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const source = Uint8Array.from(bytes).buffer;
  return runWorker({ type: "APPLY_SECURITY", requestId, password, options }, source, signal, (response) => response.type === "SECURITY_EXPORT_RESULT" ? { bytes: new Uint8Array(response.output), report: response.report } : undefined);
}
