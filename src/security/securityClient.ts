import type { SecurityExportOptions, SecurityExportReport, SecurityInspectionReport } from "../types/security";

interface InspectionSuccess { type: "SECURITY_INSPECTION_RESULT"; requestId: string; report: SecurityInspectionReport }
interface ExportSuccess { type: "SECURITY_EXPORT_RESULT"; requestId: string; output: ArrayBuffer; report: SecurityExportReport }
interface Failure { type: "SECURITY_ERROR"; requestId: string; error: { name: string; message: string } }
type Response = InspectionSuccess | ExportSuccess | Failure;

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

export async function inspectSecurity(
  bytes: Uint8Array,
  password?: string,
  signal?: AbortSignal
): Promise<SecurityInspectionReport> {
  const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const source = Uint8Array.from(bytes).buffer;
  return runWorker({ type: "INSPECT_SECURITY", requestId, password }, source, signal, (response) => response.type === "SECURITY_INSPECTION_RESULT" ? response.report : undefined);
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
