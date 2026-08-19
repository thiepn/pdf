import { reconstructInspectionTextParagraphs } from "./nativeModel";
import { registerNativeInspectionPages } from "./nativeInspectionRegistry";
import type { NativeEdit, NativeExportReport, NativeInspection } from "../types/nativeEditor";

type Response =
  | { type: "READY" }
  | { type: "NATIVE_INSPECTION"; requestId: string; inspection: NativeInspection }
  | { type: "NATIVE_RESULT"; requestId: string; output: ArrayBuffer; report: NativeExportReport }
  | { type: "NATIVE_ERROR"; requestId: string; error: { message: string } };

function call<T>(message: Record<string, unknown>, bytes: Uint8Array, password?: string, signal?: AbortSignal, extra: Transferable[] = []): Promise<T> {
  const worker = new Worker(new URL("../workers/native-editor.worker.ts", import.meta.url), { type: "module" });
  const requestId = crypto.randomUUID();
  const source = Uint8Array.from(bytes).buffer;
  return new Promise((resolve, reject) => {
    const cleanup = () => { signal?.removeEventListener("abort", cancel); worker.terminate(); };
    const cancel = () => { worker.postMessage({ type: "CANCEL", requestId }); cleanup(); reject(new DOMException("Operation cancelled.", "AbortError")); };
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<Response>) => {
      if (event.data.type === "READY") {
        worker.postMessage({ ...message, requestId, bytes: source, password }, [source, ...extra]);
        return;
      }
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "NATIVE_ERROR") reject(new Error(event.data.error.message));
      else if (event.data.type === "NATIVE_INSPECTION") {
        const reconstructed = reconstructInspectionTextParagraphs(event.data.inspection);
        resolve(registerNativeInspectionPages(reconstructed) as T);
      } else resolve({ bytes: new Uint8Array(event.data.output), report: event.data.report } as T);
    };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Native editor worker failed.")); };
  });
}

export function inspectNativePdf(bytes: Uint8Array, password?: string, signal?: AbortSignal) {
  return call<NativeInspection>({ type: "INSPECT_NATIVE" }, bytes, password, signal);
}

/**
 * P2 follower edits are move-only reconstructions. Their source text already has
 * authoritative line breaks from structured-text inspection, so re-wrapping a
 * tight extracted source bbox with fallback font metrics can invent extra lines
 * and reject an otherwise safe column move during export.
 */
export function normalizeNativeEditForExport(edit: NativeEdit): NativeEdit {
  if (edit.kind === "text" && edit.reflowFollower && edit.wrap) return { ...edit, wrap: false };
  return edit;
}

export function applyNativeEdits(bytes: Uint8Array, edits: NativeEdit[], password?: string, signal?: AbortSignal) {
  const payload = edits.map((sourceEdit) => {
    const edit = normalizeNativeEditForExport(sourceEdit);
    if (edit.kind === "image") return { ...edit, bytes: Uint8Array.from(edit.bytes).buffer };
    if (edit.kind === "text" && edit.fontBytes) return { ...edit, fontBytes: Uint8Array.from(edit.fontBytes).buffer };
    return edit;
  });
  const transfers: Transferable[] = [];
  for (const edit of payload) {
    if (edit.kind === "image") transfers.push(edit.bytes as ArrayBuffer);
    if (edit.kind === "text" && edit.fontBytes) transfers.push(edit.fontBytes as ArrayBuffer);
  }
  return call<{ bytes: Uint8Array; report: NativeExportReport }>({ type: "APPLY_NATIVE", edits: payload }, bytes, password, signal, transfers);
}
