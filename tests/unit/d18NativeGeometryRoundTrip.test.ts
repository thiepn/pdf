// @vitest-environment node
import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { createP17NativeFidelityPdf } from "../../src/fixtures/p17NativeFidelityPdf";
import { matchRenderedMaskedInvocations } from "../../src/native/nativeImageEvidence";
import type { NativeRect } from "../../src/types/nativeEditor";

function boundsFor(matrix: number[]): NativeRect {
  const [a, b, c, d, e, f] = matrix;
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => [a*x+c*y+e, b*x+d*y+f]);
  const xx = corners.map(point => point[0]);
  const yy = corners.map(point => point[1]);
  return { x: Math.min(...xx), y: Math.min(...yy),
           w: Math.max(...xx)-Math.min(...xx), h: Math.max(...yy)-Math.min(...yy) };
}

function tracedImages(page: mupdf.PDFPage): NativeRect[] {
  const images: NativeRect[] = [];
  const noOp = () => {};
  const callbacks = {
    fillPath: noOp, strokePath: noOp, fillText: noOp, strokeText: noOp,
    ignoreText: noOp, fillShade: noOp, clipPath: noOp, clipStrokePath: noOp,
    clipText: noOp, clipStrokeText: noOp, clipImageMask: noOp, popClip: noOp,
    beginMask: noOp, endMask: noOp, beginGroup: noOp, endGroup: noOp,
    fillImage(_image: unknown, matrix: number[]) { images.push(boundsFor(matrix)); },
    fillImageMask(_image: unknown, matrix: number[]) { images.push(boundsFor(matrix)); },
    beginTile: () => 0, endTile: noOp, beginLayer: noOp, endLayer: noOp,
    beginStructure: noOp, endStructure: noOp, beginMetatext: noOp,
    endMetatext: noOp, renderFlags: noOp, setDefaultColorSpaces: noOp, close: noOp
  };
  const device = new (mupdf as any).Device(callbacks);
  try {
    (page as any).runPageContents(device, (mupdf as any).Matrix.identity);
  } finally { device.destroy(); }
  return images;
}

describe("D18 real MuPDF masked-instance geometry", () => {
  it("uniquely associates attached /SMask XObject invocations with actual rendered device paints after independent PDF reopen", () => {
    const pdf = new mupdf.PDFDocument(new Uint8Array(createP17NativeFidelityPdf()));
    try {
      const page = pdf.loadPage(0) as mupdf.PDFPage;
      try {
        const object = page.getObject();
        const contents = object.get("Contents");
        if (!contents?.isStream()) throw new Error("Source PDF does not have an indirect page content stream");
        const data = contents.readStream();
        let source: string;
        try { source = data.asString(); }
        finally { data.destroy(); }
        const from = "q 70 0 0 50 390 474 cm /ImSoft Do Q";
        const to = "q 70 0 0 50 402 474 cm /ImSoft Do Q";
        expect(source).toContain(from);
        object.put("Contents", pdf.addStream(source.replace(from, to), pdf.newDictionary()));
      } finally { page.destroy(); }
      const out = pdf.saveToBuffer("garbage=0,compress=no,encrypt=keep");
      try {
        const reopened = new mupdf.PDFDocument(new Uint8Array(out.asUint8Array()));
        try {
          const page = reopened.loadPage(0) as mupdf.PDFPage;
          try {
            const resource = page.getObject().get("Resources")?.get("XObject")?.get("ImSoft");
            expect(resource?.get("SMask")?.isNull()).toBe(false);
            const observed = tracedImages(page);
            const masked = [402, 478].map(x => ({
              resourceName: "ImSoft", bounds: { x, y:474, w:70, h:50 },
              softMask:true, explicitMask:false, clipped:false, blendMode:"Normal"
            }));
            const match = matchRenderedMaskedInvocations(masked, observed);
            expect(observed.length).toBeGreaterThanOrEqual(4);
            expect(match.size).toBe(2);
            const matchedX = [...match.keys()].map(i => observed[i].x).sort((a,b)=>a-b);
            expect(matchedX).toEqual([402, 478]);
          } finally { page.destroy(); }
        } finally { reopened.destroy(); }
      } finally { out.destroy(); }
    } finally { pdf.destroy(); }
  });
});
