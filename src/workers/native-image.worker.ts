import * as mupdf from "mupdf";
import { rectFromArray } from "../native/nativeModel";
import type { NativeExportReport, NativeImageEdit, NativeImageRotation, NativeRect } from "../types/nativeEditor";

type Request =
  | { type: "APPLY_IMAGES"; requestId: string; bytes: ArrayBuffer; password?: string; edits: NativeImageEdit[] }
  | { type: "CANCEL"; requestId: string };

type PdfDocument = any;
type PdfPage = any;

const cancelled = new Set<string>();
let sequence = 0;

function active(id: string): void {
  if (cancelled.has(id)) throw new DOMException("Operation cancelled.", "AbortError");
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function auth(pdf: PdfDocument, password?: string): void {
  if (pdf.needsPassword?.() && (!password || pdf.authenticatePassword(password) === 0)) throw new Error("The PDF password is required or incorrect.");
}

function point(matrix: number[], x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

function pageRect(rect: NativeRect): [number, number, number, number] {
  return [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h];
}

function pdfRect(page: PdfPage, rect: NativeRect): [number, number, number, number] {
  const matrix = page.getTransform?.() ?? [1, 0, 0, 1, 0, 0];
  const points = [
    point(matrix, rect.x, rect.y),
    point(matrix, rect.x + rect.w, rect.y),
    point(matrix, rect.x + rect.w, rect.y + rect.h),
    point(matrix, rect.x, rect.y + rect.h)
  ];
  return [
    Math.min(...points.map((value) => value[0])),
    Math.min(...points.map((value) => value[1])),
    Math.max(...points.map((value) => value[0])),
    Math.max(...points.map((value) => value[1]))
  ];
}

function append(pdf: PdfDocument, page: PdfPage, content: string): void {
  const object = page.getObject();
  const stream = pdf.addStream(content);
  const current = object.get("Contents");
  if (!current || current.isNull?.()) object.put("Contents", stream);
  else if (current.isArray?.()) current.push(stream);
  else {
    const array = pdf.newArray();
    array.push(current);
    array.push(stream);
    object.put("Contents", array);
  }
}

function resources(pdf: PdfDocument, page: PdfPage, category: string): any {
  const object = page.getObject();
  let root = object.get("Resources");
  if (!root?.isDictionary?.()) {
    const inherited = object.getInheritable?.("Resources");
    root = inherited?.isDictionary?.() ? pdf.graftObject(inherited) : pdf.newDictionary();
    object.put("Resources", root);
  }
  let dictionary = root.get(category);
  if (!dictionary?.isDictionary?.()) {
    dictionary = pdf.newDictionary();
    root.put(category, dictionary);
  }
  return dictionary;
}

function graphicsState(pdf: PdfDocument, page: PdfPage, alpha: number): string | undefined {
  const opacity = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  if (opacity >= 0.999) return undefined;
  const states = resources(pdf, page, "ExtGState");
  const name = `LPSIMGGS${++sequence}`;
  const dictionary = pdf.newDictionary();
  dictionary.put("ca", pdf.newReal(opacity));
  dictionary.put("CA", pdf.newReal(opacity));
  states.put(name, pdf.addObject(dictionary));
  return name;
}

function normalizedRotation(value: unknown): NativeImageRotation {
  const number = Number(value);
  return number === 90 || number === 180 || number === 270 ? number : 0;
}

function matrixForImage(x: number, y: number, width: number, height: number, rotation: NativeImageRotation): string {
  if (rotation === 90) return `0 ${height} ${-width} 0 ${x + width} ${y}`;
  if (rotation === 180) return `${-width} 0 0 ${-height} ${x + width} ${y + height}`;
  if (rotation === 270) return `0 ${-height} ${width} 0 ${x} ${y + height}`;
  return `${width} 0 0 ${height} ${x} ${y}`;
}

function drawImageObject(pdf: PdfDocument, page: PdfPage, imageObject: any, intrinsicWidth: number, intrinsicHeight: number, edit: NativeImageEdit): void {
  const dictionary = resources(pdf, page, "XObject");
  const resource = `LPSIMG${++sequence}`;
  dictionary.put(resource, imageObject);

  const [x0, y0, x1, y1] = pdfRect(page, edit.bounds);
  const boxWidth = Math.max(0.01, x1 - x0);
  const boxHeight = Math.max(0.01, y1 - y0);
  const rotation = normalizedRotation(edit.rotation);
  const rotatedWidth = rotation === 90 || rotation === 270 ? intrinsicHeight : intrinsicWidth;
  const rotatedHeight = rotation === 90 || rotation === 270 ? intrinsicWidth : intrinsicHeight;

  let width = boxWidth;
  let height = boxHeight;
  let x = x0;
  let y = y0;
  let clip = false;
  if (edit.fit !== "stretch") {
    const ratio = edit.fit === "cover"
      ? Math.max(boxWidth / Math.max(1, rotatedWidth), boxHeight / Math.max(1, rotatedHeight))
      : Math.min(boxWidth / Math.max(1, rotatedWidth), boxHeight / Math.max(1, rotatedHeight));
    width = rotatedWidth * ratio;
    height = rotatedHeight * ratio;
    x = x0 + (boxWidth - width) / 2;
    y = y0 + (boxHeight - height) / 2;
    clip = edit.fit === "cover";
  }

  const gs = graphicsState(pdf, page, Number(edit.opacity ?? 1));
  const matrix = matrixForImage(x, y, width, height, rotation);
  append(pdf, page, `q${clip ? ` ${x0} ${y0} ${boxWidth} ${boxHeight} re W n` : ""}${gs ? ` /${gs} gs` : ""} ${matrix} cm /${resource} Do Q\n`);
}

function rectDistance(a: NativeRect, b: NativeRect): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h);
}

function sourceImageObject(pdf: PdfDocument, page: PdfPage, bounds: NativeRect): { object: any; width: number; height: number } {
  const structured = page.toStructuredText("preserve-images");
  try {
    let best: { image: any; score: number; width: number; height: number } | undefined;
    structured.walk({
      onImageBlock: (bbox: unknown, _transform: unknown, image: any) => {
        const candidate = rectFromArray(bbox);
        const score = rectDistance(candidate, bounds);
        if (!best || score < best.score) {
          best = {
            image,
            score,
            width: Math.max(1, safe(() => Number(image.getWidth()), 1)),
            height: Math.max(1, safe(() => Number(image.getHeight()), 1))
          };
        }
      }
    });
    if (!best || best.score > 4) throw new Error("The selected source image could not be resolved safely from the current PDF page.");
    return { object: pdf.addImage(best.image), width: best.width, height: best.height };
  } finally { structured.destroy?.(); }
}

function replacementImageObject(pdf: PdfDocument, edit: NativeImageEdit): { object: any; width: number; height: number } {
  if (!edit.bytes?.byteLength) throw new Error("Replacement image bytes are missing.");
  const image = new (mupdf as any).Image(new Uint8Array(edit.bytes));
  try {
    return {
      object: pdf.addImage(image),
      width: Math.max(1, safe(() => Number(image.getWidth()), 1)),
      height: Math.max(1, safe(() => Number(image.getHeight()), 1))
    };
  } finally { image.destroy?.(); }
}

function redactImageOnly(page: PdfPage, bounds: NativeRect): void {
  const redaction = page.createAnnotation("Redact");
  redaction.setRect(pageRect(bounds));
  redaction.update?.();
  const api = (mupdf as any).PDFPage;
  page.applyRedactions(false, api.REDACT_IMAGE_REMOVE, api.REDACT_LINE_ART_NONE, api.REDACT_TEXT_NONE);
}

function imageRects(page: PdfPage): NativeRect[] {
  const structured = page.toStructuredText("preserve-images");
  try {
    const data = JSON.parse(structured.asJSON(1));
    return (data.blocks ?? []).filter((block: any) => block.type === "image" && block.bbox).map((block: any) => rectFromArray(block.bbox));
  } catch {
    return [];
  } finally { structured.destroy?.(); }
}

function intersectionRatio(a: NativeRect, b: NativeRect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return area / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}

function save(pdf: PdfDocument): Uint8Array {
  const buffer = pdf.saveToBuffer("garbage=4,clean=yes,compress=yes,compress-images=yes,compress-fonts=yes,appearance=all,encrypt=keep");
  try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "CANCEL") { cancelled.add(request.requestId); return; }
  void (async () => {
    let pdf: PdfDocument | undefined;
    const startedAt = performance.now();
    try {
      pdf = new (mupdf as any).PDFDocument(new Uint8Array(request.bytes));
      auth(pdf, request.password);
      safe(() => pdf.checkSyntax(), 0);
      const changed = new Set<number>();
      const beforeCounts = new Map<string, number>();

      for (const edit of request.edits) {
        active(request.requestId);
        const page = pdf.loadPage(edit.pageNumber - 1);
        try {
          const sourceBounds = edit.sourceBounds ?? edit.bounds;
          beforeCounts.set(edit.id, imageRects(page).filter((rect) => intersectionRatio(rect, sourceBounds) >= 0.5).length);
          const action = edit.action ?? (edit.bytes?.byteLength ? "replace" : "transform");
          const source = action === "transform" ? sourceImageObject(pdf, page, sourceBounds) : undefined;

          if (action === "transform" || action === "delete" || edit.removeUnderlying) redactImageOnly(page, sourceBounds);
          if (action === "delete") {
            changed.add(edit.pageNumber);
            continue;
          }

          const image = action === "transform" ? source : replacementImageObject(pdf, edit);
          if (!image) throw new Error("The selected image could not be prepared for export.");
          drawImageObject(pdf, page, image.object, image.width, image.height, edit);
          changed.add(edit.pageNumber);
        } finally { page.destroy(); }
      }

      const output = save(pdf);
      const reopened = new (mupdf as any).PDFDocument(output);
      try {
        auth(reopened, request.password);
        if (reopened.countPages() !== pdf.countPages()) throw new Error("Image edit validation failed: page count changed.");
        for (const edit of request.edits) {
          const page = reopened.loadPage(edit.pageNumber - 1);
          try {
            const rects = imageRects(page);
            const action = edit.action ?? (edit.bytes?.byteLength ? "replace" : "transform");
            if (action === "delete") {
              const sourceBounds = edit.sourceBounds ?? edit.bounds;
              const before = beforeCounts.get(edit.id) ?? 0;
              const after = rects.filter((rect) => intersectionRatio(rect, sourceBounds) >= 0.5).length;
              if (before > 0 && after >= before) throw new Error(`Image deletion did not remove the selected source image on page ${edit.pageNumber}.`);
            } else if (!rects.some((rect) => intersectionRatio(rect, edit.bounds) >= 0.2)) {
              throw new Error(`Edited image was not found at its destination on page ${edit.pageNumber} after reopening.`);
            }
          } finally { page.destroy(); }
        }

        const sourceTransforms = request.edits.filter((edit) => (edit.action ?? (edit.bytes?.byteLength ? "replace" : "transform")) === "transform").length;
        const deletions = request.edits.filter((edit) => edit.action === "delete").length;
        const warnings: string[] = [];
        if (sourceTransforms) warnings.push("Existing image content was reused locally for source transforms. PDF optimization may recompress the image stream even when the visible pixels are unchanged.");
        if (deletions) warnings.push(`${deletions} existing image${deletions === 1 ? " was" : "s were"} removed with image-only redaction; overlapping text and line art were preserved.`);
        const report: NativeExportReport = {
          operation: "native-content-edit",
          pageCount: reopened.countPages(),
          outputBytes: output.byteLength,
          changedPages: [...changed].sort((a, b) => a - b),
          textEdits: 0,
          imageEdits: request.edits.length,
          vectorEdits: 0,
          tableCellEdits: 0,
          formEdits: 0,
          warnings,
          durationMs: performance.now() - startedAt
        };
        const transferable = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
        self.postMessage({ type: "NATIVE_RESULT", requestId: request.requestId, output: transferable, report }, [transferable]);
      } finally { reopened.destroy?.(); }
    } catch (error) {
      self.postMessage({ type: "NATIVE_ERROR", requestId: request.requestId, error: { message: error instanceof Error ? error.message : String(error) } });
    } finally {
      pdf?.destroy?.();
      cancelled.delete(request.requestId);
    }
  })();
};

self.postMessage({ type: "READY" });
