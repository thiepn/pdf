// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createP17NativeFidelityPdf } from "../../src/fixtures/p17NativeFidelityPdf";
import type { NativeImageObject } from "../../src/types/nativeEditor";

describe("PDF-03 actual native-image worker classification (not helper-only geometry)", () => {
  it("distinguishes two real /SMask source paints from clipped and blended image instances", async () => {
    const fixture = createP17NativeFidelityPdf();
    const arrayBuffer = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength);
    const messages: unknown[] = [];
    let resolveResponse: (value: any) => void = () => {};
    const reply = new Promise<any>((resolve, reject) => {
      resolveResponse = resolve;
      setTimeout(() => reject(new Error("Worker did not respond to INSPECT_IMAGES")), 15000);
    });
    const scope: { onmessage?: (event: { data: unknown }) => void; postMessage: (message: any) => void } = {
      postMessage(message) {
        messages.push(message);
        if (message?.requestId === "pdf03-node-real-worker"
          && (message.type === "IMAGE_INSPECTION" || message.type === "NATIVE_ERROR")) resolveResponse(message);
      }
    };
    const global = globalThis as typeof globalThis & { self?: unknown };
    const previous = global.self;
    global.self = scope;
    try {
      await import("../../src/workers/native-image.worker");
      expect(messages.some((value: any) => value?.type === "READY")).toBe(true);
      expect(scope.onmessage).toBeTypeOf("function");
      scope.onmessage!({ data: { type: "INSPECT_IMAGES", requestId: "pdf03-node-real-worker", bytes: arrayBuffer } });
      const response = await reply;
      expect(response.type, JSON.stringify(response.error)).toBe("IMAGE_INSPECTION");
      const images: NativeImageObject[] = response.inspection.pages[0].images;
      expect(images).toHaveLength(4);
      const masked = images.filter(image => image.fidelity?.class === "masked");
      const diagnostics = images.map(image => ({
        bounds: image.bounds,
        resource: image.fidelity?.resourceName,
        class: image.fidelity?.class,
        count: image.fidelity?.invocationCount,
        clipped: image.fidelity?.clipped,
        mask: image.fidelity?.softMask,
        blend: image.fidelity?.blendMode
      }));
      expect(masked.length, `Real worker image evidence: ${JSON.stringify(diagnostics)}`).toBe(2);
      expect(masked.map(image => image.fidelity?.resourceName)).toEqual(["ImSoft", "ImSoft"]);
      for (const image of masked) {
        expect(image.fidelity?.invocationCount).toBe(2);
        expect(image.fidelity?.allowedActions).toContain("transform");
        expect(image.fidelity?.allowedActions).not.toContain("replace");
      }
      expect(images[2].editability).toBe("fidelity-protected");
      expect(images[3].editability).toBe("fidelity-protected");
    } finally {
      if (previous === undefined) delete global.self;
      else global.self = previous;
    }
  });
});
