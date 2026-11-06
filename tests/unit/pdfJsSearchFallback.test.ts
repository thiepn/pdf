import { describe, expect, it } from "vitest";
import { inspectReadOnlyPdfJsText } from "../../src/native/pdfJsSearchFallback";
import type { PDFDocumentProxy } from "pdfjs-dist";

function documentWithText() {
  const cleaned: number[] = [];
  const document = {
    numPages: 3,
    getPage: async (pageNumber: number) => ({
      getViewport: () => ({ width: 600, height: 800, transform: [1, 0, 0, -1, 0, 800] }),
      getTextContent: async () => ({
        items: [{ str: `PAGE_${pageNumber}`, transform: [1, 0, 0, 16, 40, 700], width: 80, height: 16, fontName: "F1" }]
      }),
      cleanup: () => { cleaned.push(pageNumber); }
    })
  } as unknown as PDFDocumentProxy;
  return { document, cleaned };
}

describe("read-only PDF.js search recovery", () => {
  it("recovers text on all pages with visible page-space bounds and no edit permission", async () => {
    const { document, cleaned } = documentWithText();
    const result = await inspectReadOnlyPdfJsText(document);
    expect(result.pageCount).toBe(3);
    expect(result.canEdit).toBe(false);
    expect(result.totals.text).toBe(3);
    expect(result.pages.map((page) => page.objects[0]?.text)).toEqual(["PAGE_1", "PAGE_2", "PAGE_3"]);
    expect(result.pages[1].objects[0]).toMatchObject({
      bounds: { x: 40, y: 84, w: 80, h: 16 }, editability: "unsupported",
      capability: { level: "unsupported" }
    });
    expect(cleaned).toEqual([1, 2, 3]);
  });

  it("does not extract anything when cancelled before recovery starts", async () => {
    const { document, cleaned } = documentWithText();
    const controller = new AbortController(); controller.abort();
    await expect(inspectReadOnlyPdfJsText(document, controller.signal)).rejects.toThrow();
    expect(cleaned).toEqual([]);
  });
});
