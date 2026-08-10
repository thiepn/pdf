import type { EditorExportAsset, EditorExportReport, EditorObject } from "../types/editor";

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

export async function exportEditorPdf(
  bytes: Uint8Array,
  objects: EditorObject[],
  assets: EditorExportAsset[],
  signal?: AbortSignal,
  password?: string
): Promise<{ bytes: Uint8Array; report: EditorExportReport }> {
  const worker = new Worker(new URL("../workers/editor-export.worker.ts", import.meta.url), { type: "module" });
  const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const source = Uint8Array.from(bytes).buffer;
  const transferableAssets = assets.map((asset) => ({ ...asset, bytes: asset.bytes.slice(0) }));
  const transfers: Transferable[] = [source, ...transferableAssets.map((asset) => asset.bytes)];

  return new Promise((resolve, reject) => {
    const cleanup = () => { signal?.removeEventListener("abort", cancel); worker.terminate(); };
    const cancel = () => { worker.postMessage({ type: "CANCEL", requestId }); cleanup(); reject(new DOMException("Export cancelled.", "AbortError")); };
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<Success | Failure>) => {
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "EDITOR_EXPORT_ERROR") reject(new Error(event.data.error.message));
      else resolve({ bytes: new Uint8Array(event.data.output), report: event.data.report });
    };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Editor export worker failed.")); };
    worker.postMessage({ type: "EXPORT_EDITOR", requestId, bytes: source, objects, assets: transferableAssets, password }, transfers);
  });
}
