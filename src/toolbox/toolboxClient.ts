import type { ToolboxTransformOptions, ToolboxTransformReport } from "../types/toolbox";
import { WORKER_STARTUP_TIMEOUT_MS } from "../workers/workerReliability";
interface Ready { type: "READY" }
interface Success { type: "TOOLBOX_RESULT"; requestId: string; output: ArrayBuffer; report: ToolboxTransformReport }
interface Failure { type: "TOOLBOX_ERROR"; requestId: string; error: { name: string; message: string } }
type Response = Ready | Success | Failure;
export function transformPdf(bytes: Uint8Array, options: ToolboxTransformOptions, password?: string, signal?: AbortSignal): Promise<{ bytes: Uint8Array; report: ToolboxTransformReport }> {
  if (signal?.aborted) return Promise.reject(new DOMException("Operation cancelled.", "AbortError"));
  const worker = new Worker(new URL("../workers/toolbox-entry.worker.ts", import.meta.url), { type: "module" });
  const requestId = crypto.randomUUID(); const source = Uint8Array.from(bytes).buffer;
  return new Promise((resolve, reject) => {
    let started = false;
    const cleanup = () => { clearTimeout(startupTimeout); signal?.removeEventListener("abort", cancel); worker.terminate(); };
    const cancel = () => { cleanup(); reject(new DOMException("Operation cancelled.", "AbortError")); };
    const startupTimeout = setTimeout(() => { cleanup(); reject(new Error("The PDF engine could not start. Reload the app and try again.")); }, WORKER_STARTUP_TIMEOUT_MS);
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<Response>) => {
      if (event.data.type === "READY") {
        if (started || signal?.aborted) return;
        started = true; clearTimeout(startupTimeout); try { worker.postMessage({ type: "TRANSFORM", requestId, bytes: source, options, password }, [source]); } catch (reason) { cleanup(); reject(reason instanceof Error ? reason : new Error(String(reason))); } return;
      }
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "TOOLBOX_ERROR") reject(new Error(event.data.error.message)); else resolve({ bytes: new Uint8Array(event.data.output), report: event.data.report });
    };
    worker.onmessageerror = () => { cleanup(); reject(new Error("The toolbox engine returned an unreadable response.")); };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Toolbox worker failed.")); };
  });
}
