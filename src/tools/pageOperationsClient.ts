import type { AssemblyEnginePage } from "./assemblyEngine";
export interface CompilePage { sourcePageIndex: number; rotation: 0 | 90 | 180 | 270 }
export interface MergeSource { password?: string; name: string; bytes: Uint8Array }
interface Ready { type: "READY" }
interface WorkerSuccess { type: "PAGE_OPERATION_RESULT"; requestId: string; output: ArrayBuffer; result: { pageCount: number; outputBytes: number; durationMs: number; warnings: string[] } }
interface WorkerFailure { type: "PAGE_OPERATION_ERROR"; requestId: string; error: { name: string; message: string } }
function invokeWorker(payload: object, transfers: Transferable[], signal?: AbortSignal): Promise<WorkerSuccess> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Operation cancelled.", "AbortError")); return; }
    const worker = new Worker(new URL("../workers/page-operations-entry.worker.ts", import.meta.url), { type: "module" });
    const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let started = false;
    const cleanup = () => { clearTimeout(startupTimeout); signal?.removeEventListener("abort", cancel); worker.terminate(); };
    const cancel = () => { cleanup(); reject(new DOMException("Operation cancelled.", "AbortError")); };
    const startupTimeout = setTimeout(() => { cleanup(); reject(new Error("The PDF engine could not start. Reload the app and try again.")); }, 45_000);
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<Ready | WorkerSuccess | WorkerFailure>) => {
      if (event.data.type === "READY") {
        if (started || signal?.aborted) return;
        started = true; clearTimeout(startupTimeout); worker.postMessage({ ...payload, requestId }, transfers); return;
      }
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "PAGE_OPERATION_ERROR") reject(new Error(event.data.error.message)); else resolve(event.data);
    };
    worker.onmessageerror = () => { cleanup(); reject(new Error("The page engine returned an unreadable response.")); };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Page worker failed.")); };
  });
}
export async function compilePagePlan(bytes: Uint8Array, pages: CompilePage[], signal?: AbortSignal, password?: string) {
  const input = Uint8Array.from(bytes).buffer;
  const response = await invokeWorker({ type: "COMPILE_PLAN", bytes: input, pages, password }, [input], signal);
  return { bytes: new Uint8Array(response.output), ...response.result };
}
export async function mergePdfSources(sources: MergeSource[], signal?: AbortSignal) {
  const workerSources = sources.map((source) => ({ name: source.name, password: source.password, bytes: Uint8Array.from(source.bytes).buffer }));
  const response = await invokeWorker({ type: "MERGE", sources: workerSources }, workerSources.map((source) => source.bytes), signal);
  return { bytes: new Uint8Array(response.output), ...response.result };
}

export async function assembleSources(sources: MergeSource[], pages: AssemblyEnginePage[], signal?: AbortSignal) {
  const workerSources = sources.map((source) => ({ name: source.name, password: source.password, bytes: Uint8Array.from(source.bytes).buffer }));
  const response = await invokeWorker({ type: "ASSEMBLE", sources: workerSources, pages }, workerSources.map((source) => source.bytes), signal);
  return { bytes: new Uint8Array(response.output), ...response.result };
}
