import type { NativeEdit, NativeExportReport, NativeInspection } from "../types/nativeEditor";

type Response =
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
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "NATIVE_ERROR") reject(new Error(event.data.error.message));
      else if (event.data.type === "NATIVE_INSPECTION") resolve(event.data.inspection as T);
      else resolve({ bytes: new Uint8Array(event.data.output), report: event.data.report } as T);
    };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || "Native editor worker failed.")); };
    worker.postMessage({ ...message, requestId, bytes: source, password }, [source, ...extra]);
  });
}

export function inspectNativePdf(bytes: Uint8Array, password?: string, signal?: AbortSignal) {
  return call<NativeInspection>({ type: "INSPECT_NATIVE" }, bytes, password, signal);
}

export function applyNativeEdits(bytes: Uint8Array, edits: NativeEdit[], password?: string, signal?: AbortSignal) {
  const payload = edits.map((edit) => {
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
