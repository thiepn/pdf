import type { RgbaPlane, VisualDiffPixels } from "./visualDiff";

interface Success {
  type: "COMPARE_RGBA_RESULT";
  requestId: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  changedRatio: number;
}

interface Failure {
  type: "COMPARE_RGBA_ERROR";
  requestId: string;
  error: { name: string; message: string };
}

type Response = Success | Failure;

export function runVisualDiff(left: RgbaPlane, right: RgbaPlane, signal?: AbortSignal): Promise<VisualDiffPixels> {
  const worker = new Worker(new URL("../workers/compare-diff.worker.ts", import.meta.url), { type: "module" });
  const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const leftBuffer = left.pixels.buffer as ArrayBuffer;
  const rightBuffer = right.pixels.buffer as ArrayBuffer;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      worker.terminate();
      reject(new DOMException("Comparison cancelled.", "AbortError"));
      return;
    }

    const cleanup = () => {
      signal?.removeEventListener("abort", cancel);
      worker.terminate();
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException("Comparison cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", cancel, { once: true });

    worker.onmessage = (event: MessageEvent<Response>) => {
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "COMPARE_RGBA_ERROR") {
        const error = new Error(event.data.error.message);
        error.name = event.data.error.name;
        reject(error);
        return;
      }
      resolve({
        width: event.data.width,
        height: event.data.height,
        pixels: new Uint8ClampedArray(event.data.pixels),
        changedRatio: event.data.changedRatio
      });
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "Visual comparison worker failed."));
    };

    worker.postMessage({
      type: "COMPARE_RGBA",
      requestId,
      left: { width: left.width, height: left.height, pixels: leftBuffer },
      right: { width: right.width, height: right.height, pixels: rightBuffer }
    }, [leftBuffer, rightBuffer]);
  });
}
