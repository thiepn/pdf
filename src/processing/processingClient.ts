interface ProcessingResult { type: "PROCESSING_RESULT"; requestId: string; output: ArrayBuffer; report: { operation: string; inputBytes: number; outputBytes: number; repaired: boolean; versionsBefore: number; durationMs: number; warnings: string[] } }
interface ProcessingError { type: "PROCESSING_ERROR"; requestId: string; error: { name: string; message: string } }
type Response = ProcessingResult | ProcessingError;

async function invoke(type: "OPTIMIZE" | "REPAIR", bytes: Uint8Array, options: { password?: string; removeMetadata?: boolean } = {}, signal?: AbortSignal) {
  const worker = new Worker(new URL("../workers/processing.worker.ts", import.meta.url), { type: "module" });
  const requestId = crypto.randomUUID();
  const source = Uint8Array.from(bytes).buffer;
  return new Promise<{ bytes: Uint8Array; report: ProcessingResult["report"] }>((resolve, reject) => {
    const cleanup = () => { signal?.removeEventListener("abort", cancel); worker.terminate(); };
    const cancel = () => { worker.postMessage({ type: "CANCEL", requestId }); cleanup(); reject(new DOMException("Operation cancelled.", "AbortError")); };
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<Response>) => {
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "PROCESSING_ERROR") reject(new Error(event.data.error.message));
      else resolve({ bytes: new Uint8Array(event.data.output), report: event.data.report });
    };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Processing worker failed.")); };
    worker.postMessage({ type, requestId, bytes: source, ...options }, [source]);
  });
}

export function optimizePdf(bytes: Uint8Array, options?: { password?: string; removeMetadata?: boolean }, signal?: AbortSignal) { return invoke("OPTIMIZE", bytes, options, signal); }
export function repairPdf(bytes: Uint8Array, password?: string, signal?: AbortSignal) { return invoke("REPAIR", bytes, { password }, signal); }
