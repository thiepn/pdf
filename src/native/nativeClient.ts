import { reconstructInspectionTextParagraphs } from "./nativeModel";
import { registerNativeInspectionPages } from "./nativeInspectionRegistry";
import type { NativeEdit, NativeExportReport, NativeImageEdit, NativeInspection, NativeTextEdit } from "../types/nativeEditor";

type Response =
  | { type: "READY" }
  | { type: "NATIVE_INSPECTION"; requestId: string; inspection: NativeInspection }
  | { type: "NATIVE_RESULT"; requestId: string; output: ArrayBuffer; report: NativeExportReport }
  | { type: "NATIVE_ERROR"; requestId: string; error: { message: string } };

function invoke<T>(worker: Worker, message: Record<string, unknown>, bytes: Uint8Array, password?: string, signal?: AbortSignal, extra: Transferable[] = []): Promise<T> {
  const requestId = crypto.randomUUID();
  const source = Uint8Array.from(bytes).buffer;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { worker.terminate(); reject(new DOMException("Operation cancelled.", "AbortError")); return; }
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

function nativeWorker(): Worker {
  return new Worker(new URL("../workers/native-editor.worker.ts", import.meta.url), { type: "module" });
}

function imageWorker(): Worker {
  return new Worker(new URL("../workers/native-image.worker.ts", import.meta.url), { type: "module" });
}

export function inspectNativePdf(bytes: Uint8Array, password?: string, signal?: AbortSignal) {
  return invoke<NativeInspection>(nativeWorker(), { type: "INSPECT_NATIVE" }, bytes, password, signal);
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
  if (edit.kind === "text" && edit.reflowFollower) return { ...edit, wrap: false, bounds: followerExportBounds(edit) };
  return edit;
}

function mergeReports(first: NativeExportReport | undefined, second: NativeExportReport | undefined, outputBytes: number): NativeExportReport {
  const reports = [first, second].filter((report): report is NativeExportReport => Boolean(report));
  if (!reports.length) throw new Error("Native edit export produced no report.");
  return {
    operation: "native-content-edit",
    pageCount: reports.at(-1)?.pageCount ?? reports[0].pageCount,
    outputBytes,
    changedPages: [...new Set(reports.flatMap((report) => report.changedPages))].sort((a, b) => a - b),
    textEdits: reports.reduce((sum, report) => sum + report.textEdits, 0),
    imageEdits: reports.reduce((sum, report) => sum + report.imageEdits, 0),
    vectorEdits: reports.reduce((sum, report) => sum + report.vectorEdits, 0),
    tableCellEdits: reports.reduce((sum, report) => sum + report.tableCellEdits, 0),
    formEdits: reports.reduce((sum, report) => sum + report.formEdits, 0),
    warnings: reports.flatMap((report) => report.warnings),
    durationMs: reports.reduce((sum, report) => sum + report.durationMs, 0)
  };
}

function prepareNonImageEdits(edits: NativeEdit[]): { payload: NativeEdit[]; transfers: Transferable[] } {
  const payload = edits.map((sourceEdit) => {
    const edit = normalizeNativeEditForExport(sourceEdit);
    if (edit.kind === "text" && edit.fontBytes) return { ...edit, fontBytes: Uint8Array.from(edit.fontBytes).buffer } as unknown as NativeEdit;
    return edit;
  });
  const transfers: Transferable[] = [];
  for (const edit of payload) if (edit.kind === "text" && edit.fontBytes) transfers.push(edit.fontBytes as unknown as ArrayBuffer);
  return { payload, transfers };
}

function prepareImageEdits(edits: NativeImageEdit[]): { payload: NativeImageEdit[]; transfers: Transferable[] } {
  const payload = edits.map((edit) => edit.bytes?.byteLength ? { ...edit, bytes: Uint8Array.from(edit.bytes).buffer as unknown as Uint8Array } : edit);
  const transfers: Transferable[] = [];
  for (const edit of payload) if (edit.bytes instanceof ArrayBuffer) transfers.push(edit.bytes);
  return { payload, transfers };
}

export async function applyNativeEdits(bytes: Uint8Array, edits: NativeEdit[], password?: string, signal?: AbortSignal) {
  const imageEdits = edits.filter((edit): edit is NativeImageEdit => edit.kind === "image");
  const otherEdits = edits.filter((edit) => edit.kind !== "image");
  let working = bytes;
  let nativeReport: NativeExportReport | undefined;
  let imageReport: NativeExportReport | undefined;

  if (otherEdits.length) {
    const { payload, transfers } = prepareNonImageEdits(otherEdits);
    const result = await invoke<{ bytes: Uint8Array; report: NativeExportReport }>(nativeWorker(), { type: "APPLY_NATIVE", edits: payload }, working, password, signal, transfers);
    working = result.bytes;
    nativeReport = result.report;
  }
  if (imageEdits.length) {
    const { payload, transfers } = prepareImageEdits(imageEdits);
    const result = await invoke<{ bytes: Uint8Array; report: NativeExportReport }>(imageWorker(), { type: "APPLY_IMAGES", edits: payload }, working, password, signal, transfers);
    working = result.bytes;
    imageReport = result.report;
  }

  return { bytes: working, report: mergeReports(nativeReport, imageReport, working.byteLength) };
}
