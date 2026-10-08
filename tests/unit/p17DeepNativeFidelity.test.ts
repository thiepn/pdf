import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { createP17NativeFidelityPdf } from "../../src/fixtures/p17NativeFidelityPdf";
import {
  classifyImageFidelity,
  classifyTableGeometry,
  vectorAppearanceOverrideRisks
} from "../../src/native/nativeFidelity";
import type { NativeVectorObject } from "../../src/types/nativeEditor";

function vector(overrides: Partial<NativeVectorObject> = {}): NativeVectorObject {
  return {
    id: "vector",
    type: "vector",
    pageNumber: 1,
    bounds: { x: 10, y: 10, w: 100, h: 50 },
    commands: [{ op: "M", x: 10, y: 10 }, { op: "L", x: 110, y: 10 }],
    paint: "fill-stroke",
    fillColorSpace: "RGB",
    strokeColorSpace: "RGB",
    fillComponents: [0, 0, 0],
    strokeComponents: [0, 0, 0],
    lineWidth: 1,
    lineCap: "Butt",
    lineJoin: "Miter",
    miterLimit: 10,
    dashPattern: [],
    dashPhase: 0,
    fillAlpha: 1,
    strokeAlpha: 1,
    evenOdd: false,
    blendMode: "Normal",
    clipped: false,
    definesClip: false,
    sourceStreamIndex: 0,
    sourcePathIndex: 0,
    sourceSignature: "fixture",
    editability: "source-path",
    capability: { level: "native-safe", label: "fixture", confidence: 1, reason: "fixture", preserves: [], risks: [] },
    ...overrides
  };
}

describe("P17 deep native-content fidelity policy", () => {
  it("keeps the generated deep-fidelity fixture structurally explicit", () => {
    const source = new TextDecoder().decode(createP17NativeFidelityPdf());
    expect(source).toContain("/SMask 7 0 R");
    expect(source.match(/\/ImSoft Do/g)).toHaveLength(2);
    expect(source).toContain("/GSBlend gs");
    expect(source).toContain("re W n");
  });

  it("retains sibling masked-image paints after rewriting the original content stream", () => {
    const pdf = new mupdf.PDFDocument(createP17NativeFidelityPdf());
    try {
      const page = pdf.loadPage(0);
      try {
        const content = page.getObject().get("Contents");
        expect(content.isStream()).toBe(true);
        const buffer = content.readStream();
        let source: string;
        try { source = new TextDecoder().decode(buffer.asUint8Array()); }
        finally { buffer.destroy(); }
        expect(source.match(/\\/ImSoft Do/g)).toHaveLength(2);
        const oldPaint = "q 70 0 0 50 390 474 cm /ImSoft Do Q";
        const newPaint = "q 70 0 0 50 402 474 cm /ImSoft Do Q";
        expect(source).toContain(oldPaint);
        content.writeStream(source.replace(oldPaint, newPaint));
      } finally { page.destroy(); }
      const saved = pdf.saveToBuffer("garbage=4,compress=yes,encrypt=keep");
      try {
        const reopened = new mupdf.PDFDocument(saved.asUint8Array());
        try {
          const page = reopened.loadPage(0);
          try {
            const imageBounds: number[][] = [];
            const structured = page.toStructuredText("preserve-images");
            try {
              structured.walk({ onImageBlock(bbox: number[]) { imageBounds.push(Array.from(bbox)); } });
            } finally { structured.destroy(); }
            expect(imageBounds).toHaveLength(4);
            expect(imageBounds.some((b) => Math.abs(b[0] - 402) < 2)).toBe(true);
            expect(imageBounds.some((b) => Math.abs(b[0] - 478) < 2)).toBe(true);
          } finally { page.destroy(); }
        } finally { reopened.destroy(); }
      } finally { saved.destroy(); }
    } finally { pdf.destroy(); }
  });

  it("keeps plain and shared image instances editable without mutating shared resource semantics", () => {
    const plain = classifyImageFidelity({ invocationCount: 1 });
    const shared = classifyImageFidelity({ invocationCount: 3 });
    expect(plain.editability).toBe("replace-region");
    expect(plain.fidelity?.class).toBe("plain");
    expect(shared.editability).toBe("replace-region");
    expect(shared.fidelity?.class).toBe("shared");
    expect(shared.capability.preserves.join(" ")).toMatch(/Other image instances/i);
  });

  it("qualifies attached soft masks only for source-preserving transform and delete actions", () => {
    const classified = classifyImageFidelity({ softMask: true, invocationCount: 2 });
    expect(classified.editability).toBe("replace-region");
    expect(classified.fidelity?.class).toBe("masked");
    expect(classified.fidelity?.invocationCount).toBe(2);
    expect(classified.capability.label).toBe("Shared masked source image");
    expect(classified.fidelity?.allowedActions).toEqual(["transform", "delete"]);
    expect(classified.fidelity?.allowedActions).not.toContain("replace");
    expect(classified.capability.level).toBe("safe-reconstruction");
  });

  it("fails closed for explicit masks, clipping, non-Normal blending, and ambiguous images", () => {
    for (const evidence of [
      { explicitMask: true },
      { clipped: true },
      { blendMode: "Multiply" },
      { ambiguous: true }
    ]) {
      const classified = classifyImageFidelity(evidence);
      expect(classified.editability).toBe("fidelity-protected");
      expect(classified.fidelity?.allowedActions).toEqual([]);
      expect(classified.capability.level).toBe("unsupported");
    }
  });

  it("permits vector appearance override only for simple inherited graphics state", () => {
    expect(vectorAppearanceOverrideRisks(vector())).toEqual([]);
    expect(vectorAppearanceOverrideRisks(vector({ clipped: true }))).toContain("the path is inside an inherited clipping region");
    expect(vectorAppearanceOverrideRisks(vector({ blendMode: "Multiply" }))[0]).toMatch(/Multiply/);
    expect(vectorAppearanceOverrideRisks(vector({ fillColorSpace: "Pattern" })).join(" ")).toMatch(/Pattern/);
  });

  it("classifies nonuniform, merged and merged-irregular table grids explicitly", () => {
    expect(classifyTableGeometry([20, 20], [100, 100], 0)).toBe("regular");
    expect(classifyTableGeometry([20, 22], [100, 110], 0)).toBe("nonuniform");
    expect(classifyTableGeometry([20, 50], [100, 100], 0)).toBe("irregular");
    expect(classifyTableGeometry([20, 20], [100, 100], 1)).toBe("merged");
    expect(classifyTableGeometry([20, 50], [100, 100], 1)).toBe("merged-irregular");
  });
});
