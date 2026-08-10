import type { BatesSettings, ImageReplacement, LayerInspection, ProfessionalExportReport, ProfessionalInspection, TextReplacement } from "../types/professional";

type WorkerResult =
  | { type: "PROFESSIONAL_INSPECTION_RESULT"; requestId: string; inspection: ProfessionalInspection }
  | { type: "PROFESSIONAL_EXPORT_RESULT"; requestId: string; output: ArrayBuffer; report: ProfessionalExportReport }
  | { type: "PROFESSIONAL_ERROR"; requestId: string; error: { name: string; message: string } };

function invoke<T>(message: Record<string, unknown>, bytes: Uint8Array, password?: string, signal?: AbortSignal, transfers: Transferable[] = []): Promise<T> {
  const worker = new Worker(new URL("../workers/professional.worker.ts", import.meta.url), { type: "module" });
  const requestId = crypto.randomUUID();
  const source = Uint8Array.from(bytes).buffer;
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => { signal?.removeEventListener("abort", cancel); worker.terminate(); };
    const cancel = () => { worker.postMessage({ type: "CANCEL", requestId }); cleanup(); reject(new DOMException("Operation cancelled.", "AbortError")); };
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerResult>) => {
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "PROFESSIONAL_ERROR") reject(new Error(event.data.error.message));
      else if (event.data.type === "PROFESSIONAL_INSPECTION_RESULT") resolve(event.data.inspection as T);
      else resolve({ bytes: new Uint8Array(event.data.output), report: event.data.report } as T);
    };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Professional worker failed.")); };
    worker.postMessage({ ...message, requestId, bytes: source, password }, [source, ...transfers]);
  });
}

export function inspectProfessionalPdf(bytes: Uint8Array, password?: string, signal?: AbortSignal) {
  return invoke<ProfessionalInspection>({ type: "INSPECT_PROFESSIONAL" }, bytes, password, signal);
}

export function applyProfessionalEdits(bytes: Uint8Array, edits: { text: TextReplacement[]; images: ImageReplacement[] }, password?: string, signal?: AbortSignal) {
  const imagePayload = edits.images.map((item) => ({ ...item, bytes: Uint8Array.from(item.bytes).buffer }));
  return invoke<{ bytes: Uint8Array; report: ProfessionalExportReport }>(
    { type: "APPLY_PROFESSIONAL_EDITS", text: edits.text, images: imagePayload },
    bytes,
    password,
    signal,
    imagePayload.map((item) => item.bytes),
  );
}

export function applyBatesNumbering(bytes: Uint8Array, settings: BatesSettings, password?: string, signal?: AbortSignal) {
  return invoke<{ bytes: Uint8Array; report: ProfessionalExportReport }>({ type: "APPLY_BATES", settings }, bytes, password, signal);
}

export function applyLayerVisibility(bytes: Uint8Array, layers: LayerInspection[], password?: string, signal?: AbortSignal) {
  return invoke<{ bytes: Uint8Array; report: ProfessionalExportReport }>({ type: "APPLY_LAYERS", layers }, bytes, password, signal);
}
