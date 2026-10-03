import { WORKER_STARTUP_TIMEOUT_MS } from "../workers/workerReliability";

interface FontValidationSuccess {
  type: "FONT_VALIDATION_RESULT";
  requestId: string;
  missingCharacters: string[];
}

interface FontValidationFailure {
  type: "FONT_VALIDATION_ERROR";
  requestId: string;
  error: { name: string; message: string };
}

type Response = { type: "READY" } | FontValidationSuccess | FontValidationFailure;

export const MAX_IMPORTED_FONT_BYTES = 25 * 1024 * 1024;

export interface ImportedFontValidation {
  missingCharacters: string[];
}

export function validateImportedFont(
  bytes: Uint8Array,
  fontName: string,
  text: string,
  signal?: AbortSignal
): Promise<ImportedFontValidation> {
  if (!bytes.byteLength) return Promise.reject(new Error("The selected font file is empty."));
  if (bytes.byteLength > MAX_IMPORTED_FONT_BYTES) return Promise.reject(new Error("The selected font is larger than the 25 MB import limit."));
  if (signal?.aborted) return Promise.reject(new DOMException("Font validation cancelled.", "AbortError"));

  const worker = new Worker(new URL("../workers/font-validation.worker.ts", import.meta.url), { type: "module" });
  const requestId = crypto.randomUUID();
  const payload = Uint8Array.from(bytes).buffer;

  return new Promise((resolve, reject) => {
    let started = false;
    const cleanup = () => {
      clearTimeout(startupTimeout);
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
    };
    const cancel = () => {
      if (started) {
        try { worker.postMessage({ type: "CANCEL", requestId }); } catch { /* Worker may already be unavailable. */ }
      }
      cleanup();
      reject(new DOMException("Font validation cancelled.", "AbortError"));
    };
    const startupTimeout = setTimeout(() => {
      cleanup();
      reject(new Error("The font validation engine could not start. Reload the app and try again."));
    }, WORKER_STARTUP_TIMEOUT_MS);

    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<Response>) => {
      if (event.data.type === "READY") {
        if (started || signal?.aborted) return;
        started = true;
        clearTimeout(startupTimeout);
        try {
          worker.postMessage({ type: "VALIDATE_FONT", requestId, bytes: payload, fontName, text }, [payload]);
        } catch (reason) {
          cleanup();
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        }
        return;
      }
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "FONT_VALIDATION_ERROR") {
        const error = new Error(event.data.error.message || "The selected font could not be read.");
        error.name = event.data.error.name;
        reject(error);
        return;
      }
      resolve({ missingCharacters: event.data.missingCharacters });
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error("The font validation engine returned an unreadable response."));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "The font validation engine failed."));
    };
  });
}
