import { reconstructInspectionTextParagraphs } from "./nativeModel";
import { registerNativeInspectionPages } from "./nativeInspectionRegistry";
import type { NativeEdit, NativeExportReport, NativeInspection, NativeTextEdit } from "../types/nativeEditor";

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

const FOLLOWER_RECONSTRUCTION_WIDTH_TOLERANCE = 4;

function followerExportBounds(edit: NativeTextEdit): NativeTextEdit["bounds"] {
  const extra = FOLLOWER_RECONSTRUCTION_WIDTH_TOLERANCE;
  if (edit.align === "right") return { ...edit.bounds, x: edit.bounds.x - extra, w: edit.bounds.w + extra };
  if (edit.align === "center") return { ...edit.bounds, x: edit.bounds.x - extra / 2, w: edit.bounds.w + extra };
  return { ...edit.bounds, w: edit.bounds.w + extra };
}

/**
 * P2 follower edits are move-only reconstructions. Their source text already has
 * authoritative line breaks and geometry from structured-text inspection. Keep
 * those line breaks and restore a tiny width allowance consumed by the worker's
 * 3 pt safety inset. The alignment anchor is preserved, and the original source
 * redaction rectangle remains unchanged.
 */
export function normalizeNativeEditForExport(edit: NativeEdit): NativeEdit {
  if (edit.kind === "text" && edit.reflowFollower) {
    return { ...edit, wrap: false, bounds: followerExportBounds(edit) };
  }
  return edit;
}

export function applyNativeEdits(bytes: Uint8Array, edits: NativeEdit[], password?: string, signal?: AbortSignal) {
  const payload = edits.map((sourceEdit) => {
    const edit = normalizeNativeEditForExport(sourceEdit);
    if (edit.kind === "image" && edit.bytes?.byteLength) return { ...edit, bytes: Uint8Array.from(edit.bytes).buffer };
    if (edit.kind === "text" && edit.fontBytes) return { ...edit, fontBytes: Uint8Array.from(edit.fontBytes).buffer };
    return edit;
  });
  const transfers: Transferable[] = [];
  for (const edit of payload) {
    if (edit.kind === "image" && edit.bytes instanceof ArrayBuffer) transfers.push(edit.bytes);
    if (edit.kind === "text" && edit.fontBytes) transfers.push(edit.fontBytes as ArrayBuffer);
  }
  return call<{ bytes: Uint8Array; report: NativeExportReport }>({ type: "APPLY_NATIVE", edits: payload }, bytes, password, signal, transfers);
}
