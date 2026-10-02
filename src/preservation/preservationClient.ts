import type { ImageOptimizationSettings, ImpositionSettings, OcrOverlayPage, PreservationGraph, PreservationResult } from "../types/preservation";

type Result =
  | { type: "PRESERVATION_INSPECTION"; requestId: string; graph: PreservationGraph }
  | { type: "PRESERVATION_RESULT"; requestId: string; output: ArrayBuffer; report: PreservationResult["report"] }
  | { type: "PRESERVATION_ERROR"; requestId: string; error: { message: string } };

function call<T>(message: Record<string, unknown>, bytes: Uint8Array, password?: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException("Operation cancelled.", "AbortError"));
  const worker = new Worker(new URL("../workers/preservation.worker.ts", import.meta.url), { type: "module" });
  const requestId = crypto.randomUUID();
  const input = Uint8Array.from(bytes).buffer;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
    };
    const cancel = () => {
      try { worker.postMessage({ type: "CANCEL", requestId }); } catch { /* Worker may already be gone. */ }
      cleanup();
      reject(new DOMException("Operation cancelled.", "AbortError"));
    };

    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<Result>) => {
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "PRESERVATION_ERROR") reject(new Error(event.data.error.message));
      else if (event.data.type === "PRESERVATION_INSPECTION") resolve(event.data.graph as T);
      else resolve({ bytes: new Uint8Array(event.data.output), report: event.data.report } as T);
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error("Preservation worker returned an unreadable response."));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "Preservation worker failed."));
    };

    try {
      worker.postMessage({ ...message, requestId, bytes: input, password }, [input]);
    } catch (reason) {
      cleanup();
      reject(reason instanceof Error ? reason : new Error(String(reason)));
    }
  });
}

export function inspectPreservationGraph(bytes: Uint8Array, password?: string, signal?: AbortSignal) {
  return call<PreservationGraph>({ type: "INSPECT" }, bytes, password, signal);
}

export function addOriginalPageOcr(bytes: Uint8Array, pages: OcrOverlayPage[], password?: string, signal?: AbortSignal) {
  return call<PreservationResult>({ type: "OCR_OVERLAY", pages }, bytes, password, signal);
}

export function optimizePreservedPdf(bytes: Uint8Array, settings: ImageOptimizationSettings, password?: string, signal?: AbortSignal) {
  return call<PreservationResult>({ type: "OPTIMIZE", settings }, bytes, password, signal);
}

export function imposeVectorPages(bytes: Uint8Array, settings: ImpositionSettings, password?: string, signal?: AbortSignal) {
  return call<PreservationResult>({ type: "IMPOSE", settings }, bytes, password, signal);
}
