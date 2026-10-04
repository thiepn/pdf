import { describe, expect, it } from "vitest";
import ocrPageSource from "../../src/views/OcrPage.tsx?raw";
import ocrClientSource from "../../src/ocr/ocrClient.ts?raw";
import layerPdfSource from "../../src/ocr/ocrLayerPdf.ts?raw";
import reviewSource from "../../src/ocr/OcrReviewCanvas.tsx?raw";
import languagePanelSource from "../../src/ocr/OcrLanguagePanel.tsx?raw";

describe("P3 OCR 2.0 source-preservation contracts", () => {
  it("does not ask Tesseract to generate replacement PDF pages", () => {
    expect(ocrClientSource).not.toContain("pdf: true");
    expect(ocrClientSource).not.toContain("searchablePdf");
    expect(ocrPageSource).not.toContain("mergePdfSources");
    expect(ocrPageSource).not.toContain("Only selected pages appear in the output");
  });

  it("builds OCR output from the immutable original PDF and validates the original page count", () => {
    expect(ocrPageSource).toContain("applyOcrTextLayer(sourceBytesRef.current");
    expect(ocrPageSource).toContain("summary.pageCount !== document.numPages");
    expect(ocrPageSource).toContain("Every original PDF page remains in the searchable output.");
    expect(layerPdfSource).toContain("BT 3 Tr");
    expect(layerPdfSource).toContain("OCR layer validation failed because the page count changed.");
  });

  it("skips pages that already have substantial selectable text instead of duplicating OCR", () => {
    expect(ocrPageSource).toContain("extractPageText(document, pageNumber)");
    expect(ocrPageSource).toContain("existingText.trim().length >= 120");
    expect(ocrPageSource).toContain('status: "skipped"');
    expect(ocrPageSource).toContain("avoid duplicate hidden text");
    expect(ocrPageSource).toContain("const ensureSession = async () =>");
  });

  it("makes recognition reviewable before export", () => {
    expect(ocrPageSource).toContain("<OcrReviewCanvas");
    expect(ocrPageSource).toContain("Save correction");
    expect(ocrPageSource).toContain("Exclude word");
    expect(ocrPageSource).toContain("Restore OCR");
    expect(ocrPageSource).toContain("Re-recognize region");
    expect(reviewSource).toContain("ocr-word-box--");
    expect(reviewSource).toContain("Drag on empty page space to select a region");
  });

  it("supports source-preserving continuation into the unified editor", () => {
    expect(ocrPageSource).toContain('saveOutput(true, "editor")');
    expect(ocrPageSource).toContain("Continue in Edit");
    expect(ocrPageSource).toContain('mode: "editor"');
  });

  it("suggests installed language packs without preventing mixed-language selection", () => {
    expect(languagePanelSource).toContain("suggestInstalledOcrLanguages");
    expect(languagePanelSource).toContain('[...selected, language.code]');
  });

  it("keeps OCR local and does not add a cloud recognition request", () => {
    expect(ocrPageSource).not.toContain("fetch(");
    expect(ocrClientSource).not.toContain("fetch(");
    expect(ocrClientSource).not.toContain("XMLHttpRequest");
  });
});
