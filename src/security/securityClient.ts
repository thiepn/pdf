import { recordRuntimeMetric } from "../performance/runtimeMetrics";
import type { SecurityExportOptions, SecurityExportReport, SecurityInspectionReport } from "../types/security";

interface InspectionSuccess { type: "SECURITY_INSPECTION_RESULT"; requestId: string; report: SecurityInspectionReport }
interface ExportSuccess { type: "SECURITY_EXPORT_RESULT"; requestId: string; output: ArrayBuffer; report: SecurityExportReport }
interface Failure { type: "SECURITY_ERROR"; requestId: string; error: { name: string; message: string } }
type Response = InspectionSuccess | ExportSuccess | Failure;

interface InspectionEntry {
  promise: Promise<SecurityInspectionReport>;
  controller: AbortController;
  settled: boolean;
  cancellableWaiters: number;
  uncancellableWaiters: number;
}

const MAX_INSPECTION_IDENTITIES = 8;
const identityPromiseByBytes = new WeakMap<Uint8Array, Promise<string>>();
const fallbackIdentityByBytes = new WeakMap<Uint8Array, string>();
const inspectionsByIdentity = new Map<string, Map<string, InspectionEntry>>();

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
  const worker = new Worker(new URL("../workers/security.worker.ts", import.meta.url), { type: "module" });
  const requestId = String(message.requestId);
  return new Promise((resolve, reject) => {
    const cleanup = () => { signal?.removeEventListener("abort", cancel); worker.terminate(); };
    const cancel = () => { worker.postMessage({ type: "CANCEL", requestId }); cleanup(); reject(new DOMException("Operation cancelled.", "AbortError")); };
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<Response>) => {
      if (event.data.requestId !== requestId) return;
      if (event.data.type === "SECURITY_ERROR") { cleanup(); reject(new Error(event.data.error.message)); return; }
      const value = read(event.data);
      if (value === undefined) return;
      cleanup(); resolve(value);
    };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Security worker failed.")); };
    worker.postMessage({ ...message, bytes: source }, [source]);
  });
}

async function byteIdentity(bytes: Uint8Array): Promise<string> {
  let identity = identityPromiseByBytes.get(bytes);
  if (identity) return identity;

  if (!globalThis.crypto?.subtle) {
    let fallback = fallbackIdentityByBytes.get(bytes);
    if (!fallback) {
      fallback = `object:${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
      fallbackIdentityByBytes.set(bytes, fallback);
    }
    identity = Promise.resolve(fallback);
  } else {
    const snapshot = Uint8Array.from(bytes);
    identity = globalThis.crypto.subtle.digest("SHA-256", snapshot).then((digest) =>
      Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")
    );
  }

  identityPromiseByBytes.set(bytes, identity);
  return identity;
}

function touchIdentity(identity: string, sessions: Map<string, InspectionEntry>): void {
  if (inspectionsByIdentity.get(identity) !== sessions) return;
  inspectionsByIdentity.delete(identity);
  inspectionsByIdentity.set(identity, sessions);
}

function evictSettledIdentities(): void {
  if (inspectionsByIdentity.size <= MAX_INSPECTION_IDENTITIES) return;
  for (const [identity, sessions] of inspectionsByIdentity) {
    const evictable = [...sessions.values()].every((entry) => entry.settled && !entry.cancellableWaiters && !entry.uncancellableWaiters);
    if (!evictable) continue;
    inspectionsByIdentity.delete(identity);
    if (inspectionsByIdentity.size <= MAX_INSPECTION_IDENTITIES) break;
  }
}

function removeEntry(identity: string, sessions: Map<string, InspectionEntry>, key: string): void {
  sessions.delete(key);
  if (!sessions.size && inspectionsByIdentity.get(identity) === sessions) inspectionsByIdentity.delete(identity);
}

function maybeAbortUnused(entry: InspectionEntry, identity: string, sessions: Map<string, InspectionEntry>, key: string): void {
  if (entry.settled || entry.cancellableWaiters || entry.uncancellableWaiters) return;
  entry.controller.abort();
  removeEntry(identity, sessions, key);
}

function waitWithSignal(
  entry: InspectionEntry,
  identity: string,
  sessions: Map<string, InspectionEntry>,
  key: string,
  signal: AbortSignal
): Promise<SecurityInspectionReport> {
  if (signal.aborted) {
    maybeAbortUnused(entry, identity, sessions, key);
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
      maybeAbortUnused(entry, identity, sessions, key);
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
 * preflight and Protect. Reuse is keyed by a local SHA-256 byte identity plus the
 * in-memory password state, so independently loaded Uint8Array instances for the
 * same project still share one completed report. The bounded cache stores no PDF
 * bytes or password values in diagnostics, and export/apply operations are never
 * cached.
 */
export async function inspectSecurity(
  bytes: Uint8Array,
  password?: string,
  signal?: AbortSignal
): Promise<SecurityInspectionReport> {
  const identity = await byteIdentity(bytes);
  if (signal?.aborted) throw abortError();

  let sessions = inspectionsByIdentity.get(identity);
  if (!sessions) {
    sessions = new Map();
    inspectionsByIdentity.set(identity, sessions);
    evictSettledIdentities();
  } else touchIdentity(identity, sessions);

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
      evictSettledIdentities();
      return inspection;
    }).catch((reason) => {
      current.settled = true;
      removeEntry(identity, sessions!, key);
      throw reason;
    });
    sessions.set(key, current);
    recordRuntimeMetric("worker", "security.inspection.session.miss", 0, undefined, {
      byteLength: bytes.byteLength,
      passwordProtected: Boolean(password)
    });
  }

  if (signal) return waitWithSignal(entry, identity, sessions, key, signal);
  entry.uncancellableWaiters += 1;
  try {
    return await entry.promise;
  } finally {
    entry.uncancellableWaiters = Math.max(0, entry.uncancellableWaiters - 1);
    evictSettledIdentities();
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
