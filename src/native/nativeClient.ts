import { reconstructInspectionTextParagraphs } from "./nativeModel";
import { registerNativeInspectionPages } from "./nativeInspectionRegistry";
import type {
  NativeEdit,
  NativeExportReport,
  NativeImageEdit,
  NativeInspection,
  NativeTableEdit,
  NativeTableObject,
  NativeTextEdit,
  NativeVectorEdit,
  NativeVectorObject
} from "../types/nativeEditor";

interface VectorInspection {
  pages: Array<{ pageNumber: number; vectors: NativeVectorObject[]; warnings: string[] }>;
  total: number;
  warnings: string[];
}

interface TableInspection {
  pages: Array<{ pageNumber: number; tables: NativeTableObject[]; warnings: string[] }>;
  total: number;
  warnings: string[];
}

type Response =
  | { type: "READY" }
  | { type: "NATIVE_INSPECTION"; requestId: string; inspection: NativeInspection }
  | { type: "VECTOR_INSPECTION"; requestId: string; inspection: VectorInspection }
  | { type: "TABLE_INSPECTION"; requestId: string; inspection: TableInspection }
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
      } else if (event.data.type === "VECTOR_INSPECTION") resolve(event.data.inspection as T);
      else if (event.data.type === "TABLE_INSPECTION") resolve(event.data.inspection as T);
      else resolve({ bytes: new Uint8Array(event.data.output), report: event.data.report } as T);
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

function vectorWorker(): Worker {
  return new Worker(new URL("../workers/native-vector.worker.ts", import.meta.url), { type: "module" });
}

function tableWorker(): Worker {
  return new Worker(new URL("../workers/native-table.worker.ts", import.meta.url), { type: "module" });
}

function mergeVectorInspection(base: NativeInspection, vector: VectorInspection): NativeInspection {
  const pages = base.pages.map((page) => {
    const replacement = vector.pages.find((candidate) => candidate.pageNumber === page.pageNumber)?.vectors ?? [];
    const firstLegacyVector = page.objects.findIndex((object) => object.type === "vector");
    const withoutLegacy = page.objects.filter((object) => object.type !== "vector");
    const firstTableOrForm = withoutLegacy.findIndex((object) => object.type === "table" || object.type === "form");
    const insertion = firstLegacyVector >= 0
      ? Math.min(firstLegacyVector, withoutLegacy.length)
      : Math.min(firstTableOrForm < 0 ? withoutLegacy.length : firstTableOrForm, withoutLegacy.length);
    return { ...page, objects: [...withoutLegacy.slice(0, insertion), ...replacement, ...withoutLegacy.slice(insertion)] };
  });
  return registerNativeInspectionPages({
    ...base,
    pages,
    totals: { ...base.totals, vectors: vector.total },
    warnings: [...base.warnings.filter((warning) => !/vector/i.test(warning)), ...vector.warnings]
  });
}

function mergeTableInspection(base: NativeInspection, table: TableInspection): NativeInspection {
  const pages = base.pages.map((page) => {
    const replacement = table.pages.find((candidate) => candidate.pageNumber === page.pageNumber)?.tables ?? [];
    const firstLegacyTable = page.objects.findIndex((object) => object.type === "table");
    const withoutLegacy = page.objects.filter((object) => object.type !== "table");
    const firstForm = withoutLegacy.findIndex((object) => object.type === "form");
    const insertion = firstLegacyTable >= 0
      ? Math.min(firstLegacyTable, withoutLegacy.length)
      : Math.min(firstForm < 0 ? withoutLegacy.length : firstForm, withoutLegacy.length);
    return { ...page, objects: [...withoutLegacy.slice(0, insertion), ...replacement, ...withoutLegacy.slice(insertion)] };
  });
  return registerNativeInspectionPages({
    ...base,
    pages,
    totals: { ...base.totals, tables: table.total },
    warnings: [...base.warnings.filter((warning) => !/table/i.test(warning)), ...table.warnings]
  });
}

export async function inspectNativePdf(bytes: Uint8Array, password?: string, signal?: AbortSignal): Promise<NativeInspection> {
  // P5 keeps the qualified P1/P2 worker untouched. Finish that worker first so
  // a large document never holds three MuPDF documents concurrently, then run
  // the two source-specialist inspections in parallel and merge their objects.
  const base = await invoke<NativeInspection>(nativeWorker(), { type: "INSPECT_NATIVE" }, bytes, password, signal);
  const [vector, table] = await Promise.all([
    invoke<VectorInspection>(vectorWorker(), { type: "INSPECT_VECTORS" }, bytes, password, signal),
    invoke<TableInspection>(tableWorker(), { type: "INSPECT_TABLES" }, bytes, password, signal)
  ]);
  return mergeTableInspection(mergeVectorInspection(base, vector), table);
}

const FOLLOWER_RECONSTRUCTION_WIDTH_TOLERANCE = 4;

function followerExportBounds(edit: NativeTextEdit): NativeTextEdit["bounds"] {
  const extra = FOLLOWER_RECONSTRUCTION_WIDTH_TOLERANCE;
  if (edit.align === "right") return { ...edit.bounds, x: edit.bounds.x - extra, w: edit.bounds.w + extra };
  if (edit.align === "center") return { ...edit.bounds, x: edit.bounds.x - extra / 2, w: edit.bounds.w + extra };
  return { ...edit.bounds, w: edit.bounds.w + extra };
}

export function normalizeNativeEditForExport(edit: NativeEdit): NativeEdit {
  if (edit.kind === "text" && edit.reflowFollower) return { ...edit, wrap: false, bounds: followerExportBounds(edit) };
  return edit;
}

function mergeReports(reports: Array<NativeExportReport | undefined>, outputBytes: number): NativeExportReport {
  const available = reports.filter((report): report is NativeExportReport => Boolean(report));
  if (!available.length) throw new Error("Native edit export produced no report.");
  return {
    operation: "native-content-edit",
    pageCount: available.at(-1)?.pageCount ?? available[0].pageCount,
    outputBytes,
    changedPages: [...new Set(available.flatMap((report) => report.changedPages))].sort((a, b) => a - b),
    textEdits: available.reduce((sum, report) => sum + report.textEdits, 0),
    imageEdits: available.reduce((sum, report) => sum + report.imageEdits, 0),
    vectorEdits: available.reduce((sum, report) => sum + report.vectorEdits, 0),
    tableCellEdits: available.reduce((sum, report) => sum + report.tableCellEdits, 0),
    formEdits: available.reduce((sum, report) => sum + report.formEdits, 0),
    warnings: available.flatMap((report) => report.warnings),
    durationMs: available.reduce((sum, report) => sum + report.durationMs, 0)
  };
}

function prepareNonSpecialistEdits(edits: NativeEdit[]): { payload: NativeEdit[]; transfers: Transferable[] } {
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
  const vectorEdits = edits.filter((edit): edit is NativeVectorEdit => edit.kind === "vector");
  const tableEdits = edits.filter((edit): edit is NativeTableEdit => edit.kind === "table");
  const otherEdits = edits.filter((edit) => edit.kind !== "image" && edit.kind !== "vector" && edit.kind !== "table");
  let working = bytes;
  let nativeReport: NativeExportReport | undefined;
  let vectorReport: NativeExportReport | undefined;
  let tableReport: NativeExportReport | undefined;
  let imageReport: NativeExportReport | undefined;

  if (otherEdits.length) {
    const { payload, transfers } = prepareNonSpecialistEdits(otherEdits);
    const result = await invoke<{ bytes: Uint8Array; report: NativeExportReport }>(nativeWorker(), { type: "APPLY_NATIVE", edits: payload }, working, password, signal, transfers);
    working = result.bytes;
    nativeReport = result.report;
  }
  if (vectorEdits.length) {
    const result = await invoke<{ bytes: Uint8Array; report: NativeExportReport }>(vectorWorker(), { type: "APPLY_VECTORS", edits: vectorEdits }, working, password, signal);
    working = result.bytes;
    vectorReport = result.report;
  }
  if (tableEdits.length) {
    const result = await invoke<{ bytes: Uint8Array; report: NativeExportReport }>(tableWorker(), { type: "APPLY_TABLES", edits: tableEdits }, working, password, signal);
    working = result.bytes;
    tableReport = result.report;
  }
  if (imageEdits.length) {
    const { payload, transfers } = prepareImageEdits(imageEdits);
    const result = await invoke<{ bytes: Uint8Array; report: NativeExportReport }>(imageWorker(), { type: "APPLY_IMAGES", edits: payload }, working, password, signal, transfers);
    working = result.bytes;
    imageReport = result.report;
  }

  return { bytes: working, report: mergeReports([nativeReport, vectorReport, tableReport, imageReport], working.byteLength) };
}