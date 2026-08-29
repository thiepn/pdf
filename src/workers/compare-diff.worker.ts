import { diffRgbaPlanes } from "../comparison/visualDiff";

interface CompareRequest {
  type: "COMPARE_RGBA";
  requestId: string;
  left: { width: number; height: number; pixels: ArrayBuffer };
  right: { width: number; height: number; pixels: ArrayBuffer };
  threshold?: number;
}

self.onmessage = (event: MessageEvent<CompareRequest>) => {
  const request = event.data;
  if (request.type !== "COMPARE_RGBA") return;
  try {
    const result = diffRgbaPlanes(
      { width: request.left.width, height: request.left.height, pixels: new Uint8ClampedArray(request.left.pixels) },
      { width: request.right.width, height: request.right.height, pixels: new Uint8ClampedArray(request.right.pixels) },
      request.threshold
    );
    const pixels = result.pixels.buffer;
    self.postMessage({
      type: "COMPARE_RGBA_RESULT",
      requestId: request.requestId,
      width: result.width,
      height: result.height,
      pixels,
      changedRatio: result.changedRatio
    }, [pixels]);
  } catch (reason) {
    self.postMessage({
      type: "COMPARE_RGBA_ERROR",
      requestId: request.requestId,
      error: { name: reason instanceof Error ? reason.name : "Error", message: reason instanceof Error ? reason.message : String(reason) }
    });
  }
};

export {};
