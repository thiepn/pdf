import type { PDFDocumentProxy } from "pdfjs-dist";
import type { NativeInspection, NativeTextObject } from "../types/nativeEditor";

const MAX_PAGES = 100;
const MAX_TEXT_OBJECTS = 6_000;
const MAX_OBJECTS_PER_PAGE = 300;
const REASON = "The native source inspector did not complete. PDF.js text recovery is for searching and reviewing only; direct PDF-object editing stays disabled.";

/**
 * Non-destructive recovery path after a genuine native inspection failure.
 * PDF.js text extraction provides approximate selection bounds, not qualified
 * native-object identity, font metrics, security permissions or edit geometry.
 */
export async function inspectReadOnlyPdfJsText(
  document: PDFDocumentProxy,
  signal?: AbortSignal
): Promise<NativeInspection> {
  const pages: NativeInspection["pages"] = [];
  let total = 0;
  const pageLimit = Math.min(document.numPages, MAX_PAGES);
  const warnings = [REASON];
  for (let pageNumber = 1; pageNumber <= pageLimit && total < MAX_TEXT_OBJECTS; pageNumber += 1) {
    signal?.throwIfAborted();
    const page = await document.getPage(pageNumber);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const width = Math.max(1, viewport.width), height = Math.max(1, viewport.height);
      const objects: NativeTextObject[] = [];
      const matrix = viewport.transform;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const text = item.str.trim();
        if (!text) continue;
        if (objects.length >= MAX_OBJECTS_PER_PAGE || total >= MAX_TEXT_OBJECTS) break;
        const [, , , , tx, ty] = item.transform;
        const x = matrix[0] * tx + matrix[2] * ty + matrix[4];
        const baselineY = matrix[1] * tx + matrix[3] * ty + matrix[5];
        const rawW = Math.max(1, Math.abs(item.width));
        const rawH = Math.max(1, Math.abs(item.height));
        if (![x, baselineY, rawW, rawH].every(Number.isFinite)) continue;
        const left = Math.max(0, Math.min(width - 1, x));
        const top = Math.max(0, Math.min(height - 1, baselineY - rawH));
        const boxW = Math.max(1, Math.min(width - left, rawW));
        const boxH = Math.max(1, Math.min(height - top, rawH));
        objects.push({
          id: `pdfjs-readonly:p${pageNumber}:t${objects.length}`,
          type: "text",
          pageNumber,
          bounds: { x: left, y: top, w: boxW, h: boxH },
          text,
          fontName: item.fontName || "PDF source",
          family: "sans-serif",
          size: boxH,
          weight: "normal",
          style: "normal",
          writingMode: 0,
          script: "unknown",
          editability: "unsupported",
          reason: REASON,
          capability: { level: "unsupported", label: "Search and inspect only", confidence: 0, reason: REASON, preserves: ["Original PDF bytes"], risks: [] }
        });
        total += 1;
      }
      pages.push({ pageNumber, originX: 0, originY: 0, width, height, objects });
      if (objects.length >= MAX_OBJECTS_PER_PAGE) warnings.push(`Page ${pageNumber} contains more text blocks than the bounded recovery can inspect. Some search matches may be unavailable.`);
    } finally { page.cleanup(); }
  }
  if (pageLimit < document.numPages || total >= MAX_TEXT_OBJECTS) warnings.push("Search recovery is partial for this large PDF. The complete original document remains available in Read.");
  return { pageCount: document.numPages, canEdit: false, pages, fonts: [], totals: { text: total, images: 0, vectors: 0, tables: 0, forms: 0, complex: 0 }, warnings };
}
