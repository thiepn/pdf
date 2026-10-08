import { validatePdfFidelity } from "../fidelity/pdfFidelityClient";
import { applyNativeEdits, takeNativeExportReplay } from "../native/nativeClient";
import type { EditorExportAsset, EditorExportReport, EditorObject } from "../types/editor";
import { WORKER_STARTUP_TIMEOUT_MS } from "../workers/workerReliability";

interface Ready {
  type: "EDITOR_EXPORT_READY";
}
interface Success {
  type: "EDITOR_EXPORT_RESULT";
  requestId: string;
  output: ArrayBuffer;
  report: EditorExportReport;
}
interface Failure {
  type: "EDITOR_EXPORT_ERROR";
  requestId: string;
  error: { name: string; message: string };
}
type Response = Ready | Success | Failure;

async function exportOverlayPdf(
  bytes: Uint8Array,
  objects: EditorObject[],
  assets: EditorExportAsset[],
  signal?: AbortSignal,
  password?: string
): Promise<{ bytes: Uint8Array; report: EditorExportReport }> {
  if (signal?.aborted) throw new DOMException("Export cancelled.", "AbortError");
  const worker = new Worker(new URL("../workers/editor-export.worker.ts", import.meta.url), { type: "module" });
  const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const source = Uint8Array.from(bytes).buffer;
  const transferableAssets = assets.map((asset) => ({ ...asset, bytes: asset.bytes.slice(0) }));
  const transfers: Transferable[] = [source, ...transferableAssets.map((asset) => asset.bytes)];

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      worker.terminate();
      reject(new DOMException("Export cancelled.", "AbortError"));
      return;
    }
    let started = false;
    const cleanup = () => { clearTimeout(startupTimeout); signal?.removeEventListener("abort", cancel); worker.terminate(); };
    const cancel = () => { if (started) { try { worker.postMessage({ type: "CANCEL", requestId }); } catch { /* Worker may already be gone. */ } } cleanup(); reject(new DOMException("Export cancelled.", "AbortError")); };
    const startupTimeout = setTimeout(() => {
      cleanup();
      reject(new Error("The editor export engine could not start. Reload the app and try again."));
    }, WORKER_STARTUP_TIMEOUT_MS);
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<Response>) => {
      if (event.data.type === "EDITOR_EXPORT_READY") {
        if (started || signal?.aborted) return;
        started = true;
        clearTimeout(startupTimeout);
        try {
          worker.postMessage({ type: "EXPORT_EDITOR", requestId, bytes: source, objects, assets: transferableAssets, password }, transfers);
        } catch (reason) {
          cleanup();
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        }
        return;
      }
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "EDITOR_EXPORT_ERROR") reject(new Error(event.data.error.message));
      else resolve({ bytes: new Uint8Array(event.data.output), report: event.data.report });
    };
    worker.onmessageerror = () => { cleanup(); reject(new Error("The editor export engine returned an unreadable response.")); };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Editor export worker failed.")); };
  });
}

function visibleObjectPages(objects: EditorObject[]): number[] {
  return objects.filter((object) => !object.hidden).map((object) => object.pageNumber);
}

async function certifyEditorExport(
  sourceBytes: Uint8Array,
  result: { bytes: Uint8Array; report: EditorExportReport },
  affectedPages: Iterable<number>,
  password?: string,
  signal?: AbortSignal,
  expectedAddedFields = 0
): Promise<{ bytes: Uint8Array; report: EditorExportReport }> {
  const fidelity = await validatePdfFidelity(sourceBytes, result.bytes, affectedPages, password, signal, expectedAddedFields);
  if (!fidelity.passed) throw new Error(`P8 fidelity validation failed: ${fidelity.failures.join(" ")}`);
  return {
    bytes: result.bytes,
    report: {
      ...result.report,
      warnings: [...new Set([...result.report.warnings, ...fidelity.warnings])]
    }
  };
}

export async function exportEditorPdf(
  bytes: Uint8Array,
  objects: EditorObject[],
  assets: EditorExportAsset[],
  signal?: AbortSignal,
  password?: string
): Promise<{ bytes: Uint8Array; report: EditorExportReport }> {
  const replay = takeNativeExportReplay(bytes);
  if (!replay) {
    const overlay = await exportOverlayPdf(bytes, objects, assets, signal, password);
    return certifyEditorExport(bytes, overlay, visibleObjectPages(objects), password, signal, objects.filter((object) => !object.hidden && object.type === "form-field").length);
  }

  // P6 mixed exports compile overlay annotations against the original PDF.
  // Native P1-P7 edits are then replayed, and P8 validates the final document
  // end-to-end against that original source rather than trusting either stage.
  const exportPassword = replay.password ?? password;
  const overlay = await exportOverlayPdf(replay.sourceBytes, objects, assets, signal, exportPassword);
  const native = await applyNativeEdits(overlay.bytes, replay.edits, exportPassword, signal);
  const result = {
    bytes: native.bytes,
    report: {
      ...overlay.report,
      pageCount: native.report.pageCount,
      outputBytes: native.bytes.byteLength,
      warnings: [...new Set([...overlay.report.warnings, ...native.report.warnings])]
    }
  };
  return certifyEditorExport(
    replay.sourceBytes,
    result,
    [...visibleObjectPages(objects), ...replay.edits.map((edit) => edit.pageNumber)],
    exportPassword,
    signal,
    objects.filter((object) => !object.hidden && object.type === "form-field").length
  );
}