import { recordRuntimeMetric } from "../performance/runtimeMetrics";
import type { NativeInspection } from "../types/nativeEditor";
import * as base from "./nativeClientBase";

export * from "./nativeClientBase";

const inspectionsByBytes = new WeakMap<Uint8Array, Map<string, Promise<NativeInspection>>>();

function inspectionKey(password?: string): string {
  return password ? `protected:${password}` : "unprotected";
}

/**
 * Recovery P2 reuses the completed MuPDF inspection session when the same
 * immutable project bytes return to Edit. Cancellable one-off callers still use
 * a fresh worker chain so abort semantics remain exact.
 */
export async function inspectNativePdf(bytes: Uint8Array, password?: string, signal?: AbortSignal): Promise<NativeInspection> {
  if (signal) return base.inspectNativePdf(bytes, password, signal);
  let sessions = inspectionsByBytes.get(bytes);
  if (!sessions) {
    sessions = new Map();
    inspectionsByBytes.set(bytes, sessions);
  }
  const key = inspectionKey(password);
  const cached = sessions.get(key);
  if (cached) {
    recordRuntimeMetric("worker", "mupdf.inspection.session.hit", 0, undefined, {
      byteLength: bytes.byteLength,
      passwordProtected: Boolean(password)
    });
    return cached;
  }
  recordRuntimeMetric("worker", "mupdf.inspection.session.miss", 0, undefined, {
    byteLength: bytes.byteLength,
    passwordProtected: Boolean(password)
  });
  const pending = base.inspectNativePdf(bytes, password).catch((reason) => {
    sessions!.delete(key);
    throw reason;
  });
  sessions.set(key, pending);
  return pending;
}
