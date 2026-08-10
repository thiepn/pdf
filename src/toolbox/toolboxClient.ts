import type { ToolboxTransformOptions, ToolboxTransformReport } from "../types/toolbox";

interface Success { type: "TOOLBOX_RESULT"; requestId: string; output: ArrayBuffer; report: ToolboxTransformReport }
interface Failure { type: "TOOLBOX_ERROR"; requestId: string; error: { name: string; message: string } }
type Response = Success | Failure;

export function transformPdf(bytes: Uint8Array, options: ToolboxTransformOptions, password?: string, signal?: AbortSignal): Promise<{ bytes: Uint8Array; report: ToolboxTransformReport }> {
  const worker = new Worker(new URL("../workers/toolbox.worker.ts", import.meta.url), { type: "module" });
  const requestId = crypto.randomUUID();
  const source = Uint8Array.from(bytes).buffer;
  return new Promise((resolve, reject) => {
    const cleanup = () => { signal?.removeEventListener("abort", cancel); worker.terminate(); };
    const cancel = () => { worker.postMessage({ type: "CANCEL", requestId }); cleanup(); reject(new DOMException("Operation cancelled.", "AbortError")); };
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<Response>) => {
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "TOOLBOX_ERROR") reject(new Error(event.data.error.message));
      else resolve({ bytes: new Uint8Array(event.data.output), report: event.data.report });
    };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Toolbox worker failed.")); };
    worker.postMessage({ type: "TRANSFORM", requestId, bytes: source, options, password }, [source]);
  });
}
