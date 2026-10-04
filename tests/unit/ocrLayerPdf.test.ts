import { describe, expect, it } from "vitest";
import * as mupdf from "mupdf";
import { applyOcrLayerPdf } from "../../src/ocr/ocrLayerPdf";

function sourcePdf(): Uint8Array {
  const pdf = new mupdf.PDFDocument();
  const font = new mupdf.Font("Helvetica");
  const fontRef = pdf.addSimpleFont(font, "Latin");
  try {
    const page = pdf.addPage([0, 0, 420, 594], 0, { Font: { F1: fontRef } }, "BT /F1 18 Tf 40 520 Td (ORIGINAL PAGE CONTENT) Tj ET");
    pdf.insertPage(-1, page);
    const buffer = pdf.saveToBuffer({});
    try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
  } finally {
    fontRef.destroy();
    font.destroy();
    pdf.destroy();
  }
}

describe("P3 source-preserving OCR PDF layer", () => {
  it("keeps the original page content and appends extractable OCR text", () => {
    const source = sourcePdf();
    const result = applyOcrLayerPdf(source, [{
      pageNumber: 1,
      words: [{ text: "SCANNEDWORD", confidence: 94, rect: { x0: .12, y0: .22, x1: .34, y1: .27 } }]
    }]);

    expect(result.pageCount).toBe(1);
    expect(result.changedPages).toEqual([1]);
    expect(result.appliedWords).toBe(1);
    expect(result.skippedWords).toBe(0);

    const reopened = new mupdf.PDFDocument(result.output);
    try {
      expect(reopened.countPages()).toBe(1);
      const page = reopened.loadPage(0);
      try {
        const text = page.toStructuredText().asText();
        expect(text).toContain("ORIGINAL PAGE CONTENT");
        expect(text).toContain("SCANNEDWORD");
      } finally { page.destroy(); }
    } finally { reopened.destroy(); }
  });

  it("retains every original page when OCR targets only a subset", () => {
    const pdf = new mupdf.PDFDocument();
    try {
      pdf.insertPage(-1, pdf.addPage([0, 0, 420, 594], 0, {}, ""));
      pdf.insertPage(-1, pdf.addPage([0, 0, 420, 594], 0, {}, ""));
      const buffer = pdf.saveToBuffer({});
      try {
        const result = applyOcrLayerPdf(Uint8Array.from(buffer.asUint8Array()), [{
          pageNumber: 2,
          words: [{ text: "SECOND", confidence: 90, rect: { x0: .1, y0: .1, x1: .25, y1: .15 } }]
        }]);
        expect(result.pageCount).toBe(2);
        expect(result.changedPages).toEqual([2]);
        const reopened = new mupdf.PDFDocument(result.output);
        try { expect(reopened.countPages()).toBe(2); } finally { reopened.destroy(); }
      } finally { buffer.destroy(); }
    } finally { pdf.destroy(); }
  });
});
