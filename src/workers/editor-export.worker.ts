import * as mupdf from "mupdf";
import type { AffineMatrix, Point, Rect } from "../core/coordinates";
import type { EditorExportAsset, EditorObject } from "../types/editor";

interface ExportRequest {
  type: "EXPORT_EDITOR";
  requestId: string;
  bytes: ArrayBuffer;
  objects: EditorObject[];
  assets: EditorExportAsset[];
  password?: string;
}
interface CancelRequest { type: "CANCEL"; requestId: string }
type Request = ExportRequest | CancelRequest;
const cancelled = new Set<string>();

function assertActive(requestId: string): void {
  if (cancelled.has(requestId)) throw new DOMException("Operation cancelled.", "AbortError");
}

function invert(matrix: AffineMatrix): AffineMatrix {
  const [a, b, c, d, e, f] = matrix;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) throw new Error("Page coordinate transform is not invertible.");
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

function point(matrix: AffineMatrix, value: Point): [number, number] {
  const [a, b, c, d, e, f] = matrix;
  return [a * value.x + c * value.y + e, b * value.x + d * value.y + f];
}

function rect(matrix: AffineMatrix, value: Rect): [number, number, number, number] {
  const points = [
    point(matrix, { x: value.x0, y: value.y0 }),
    point(matrix, { x: value.x1, y: value.y0 }),
    point(matrix, { x: value.x1, y: value.y1 }),
    point(matrix, { x: value.x0, y: value.y1 })
  ];
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1]))
  ];
}

function color(hex: string): number[] | null {
  const normalized = hex.replace(/^#/, "");
  if (![6, 8].includes(normalized.length)) return null;
  const alpha = normalized.length === 8 ? parseInt(normalized.slice(6, 8), 16) / 255 : 1;
  if (alpha <= 0.001) return null;
  return [parseInt(normalized.slice(0, 2), 16) / 255, parseInt(normalized.slice(2, 4), 16) / 255, parseInt(normalized.slice(4, 6), 16) / 255];
}

function opacity(hex: string, fallback: number): number {
  const normalized = hex.replace(/^#/, "");
  if (normalized.length !== 8) return fallback;
  return fallback * (parseInt(normalized.slice(6, 8), 16) / 255);
}

function setCommon(annotation: any, object: EditorObject, author = "PDF Studio"): void {
  annotation.setName(object.id);
  annotation.setFlags?.(4);
  if (annotation.hasAuthor?.()) annotation.setAuthor(author);
  annotation.setCreationDate?.(new Date(object.createdAt));
  annotation.setModificationDate?.(new Date(object.modifiedAt));
  annotation.setOpacity?.(Math.max(0.01, Math.min(1, object.opacity)));
}

function setBorder(annotation: any, width: number, dash: "solid" | "dashed" | "dotted" = "solid"): void {
  if (annotation.hasBorder?.()) {
    annotation.setBorderWidth(Math.max(0, width));
    if (dash === "dashed") annotation.setBorderDashPattern([5, 3]);
    else if (dash === "dotted") annotation.setBorderDashPattern([1, 2]);
    else annotation.clearBorderDash?.();
  }
}

function addText(page: any, object: Extract<EditorObject, { type: "text" }>, transform: AffineMatrix, warnings: string[]): void {
  const annotation = page.createAnnotation("FreeText");
  setCommon(annotation, object);
  annotation.setRect(rect(transform, object.bounds));
  annotation.setContents(object.text);
  const font = object.fontFamily === "Times-Roman" ? "TiRo" : object.fontFamily === "Courier" ? "Cour" : "Helv";
  annotation.setDefaultAppearance(font, Math.max(1, object.fontSize), color(object.color) ?? [0, 0, 0]);
  annotation.setQuadding?.(object.textAlign === "center" ? 1 : object.textAlign === "right" ? 2 : 0);
  if (object.fontWeight === "bold" || object.fontStyle === "italic") warnings.push("Bold and italic styling for editable visual text layers can vary between PDF readers; the standard appearance uses the selected base font.");
  const background = color(object.backgroundColor);
  if (background && annotation.hasInteriorColor?.()) annotation.setInteriorColor(background);
  const border = color(object.borderColor);
  if (border) annotation.setColor(border);
  setBorder(annotation, object.borderWidth);
  if (annotation.hasRichContents?.()) {
    const style = [
      `font-size:${object.fontSize}pt`,
      `font-family:${object.fontFamily}`,
      `font-weight:${object.fontWeight}`,
      `font-style:${object.fontStyle}`,
      `text-align:${object.textAlign}`,
      `line-height:${object.lineHeight}`
    ].join(";");
    try { annotation.setRichDefaults(style); } catch { warnings.push("Some rich text styling could not be embedded and was reduced to standard PDF text appearance."); }
  }
  annotation.update?.();
}

function addShape(page: any, object: Extract<EditorObject, { type: "shape" }>, transform: AffineMatrix): void {
  if (object.shape === "line" || object.shape === "arrow") {
    const annotation = page.createAnnotation("Line");
    setCommon(annotation, object);
    const a = point(transform, { x: object.bounds.x0, y: object.bounds.y0 });
    const b = point(transform, { x: object.bounds.x1, y: object.bounds.y1 });
    annotation.setLine(a, b);
    annotation.setColor(color(object.strokeColor) ?? [0, 0, 0]);
    setBorder(annotation, object.strokeWidth, object.dash);
    if (object.shape === "arrow") annotation.setLineEndingStyles?.("None", "ClosedArrow");
    annotation.update?.();
    return;
  }
  const annotation = page.createAnnotation(object.shape === "ellipse" ? "Circle" : "Square");
  setCommon(annotation, object);
  annotation.setRect(rect(transform, object.bounds));
  annotation.setColor(color(object.strokeColor) ?? [0, 0, 0]);
  const fill = color(object.fillColor);
  if (fill && annotation.hasInteriorColor?.()) annotation.setInteriorColor(fill);
  setBorder(annotation, object.strokeWidth, object.dash);
  annotation.update?.();
}

function addInk(page: any, object: Extract<EditorObject, { type: "ink" }>, transform: AffineMatrix): void {
  const annotation = page.createAnnotation("Ink");
  setCommon(annotation, object);
  annotation.setInkList(object.strokes.map((stroke) => stroke.map((value) => point(transform, value))));
  annotation.setColor(color(object.color) ?? [0, 0, 0]);
  annotation.setOpacity(object.highlighter ? Math.min(0.5, object.opacity) : object.opacity);
  setBorder(annotation, object.strokeWidth);
  annotation.update?.();
}

function addHighlight(page: any, object: Extract<EditorObject, { type: "highlight" }>, transform: AffineMatrix): void {
  const annotationType = object.style === "underline" ? "Underline" : object.style === "strikeout" ? "StrikeOut" : object.style === "squiggly" ? "Squiggly" : "Highlight";
  const annotation = page.createAnnotation(annotationType);
  setCommon(annotation, object);
  const box = rect(transform, object.bounds);
  annotation.setQuadPoints([[box[0], box[1], box[2], box[1], box[2], box[3], box[0], box[3]]]);
  annotation.setColor(color(object.color) ?? [1, 0.9, 0.2]);
  annotation.setOpacity(opacity(object.color, Math.min(0.45, object.opacity)));
  annotation.update?.();
}

function addNote(page: any, object: Extract<EditorObject, { type: "note" }>, transform: AffineMatrix): void {
  const annotation = page.createAnnotation("Text");
  setCommon(annotation, object, object.author);
  annotation.setRect(rect(transform, object.bounds));
  annotation.setContents(object.contents);
  annotation.setSubject?.(object.subject);
  annotation.setColor(color(object.color) ?? [1, 0.8, 0.2]);
  annotation.setIcon?.(object.resolved ? "Check" : "Comment");
  annotation.update?.();
}

function addLink(pdf: any, page: any, object: Extract<EditorObject, { type: "link" }>, transform: AffineMatrix): void {
  let uri = object.target.trim();
  if (object.targetType === "email" && !uri.startsWith("mailto:")) uri = `mailto:${uri}`;
  if (object.targetType === "page") {
    const pageIndex = Math.max(0, Math.min(pdf.countPages() - 1, Number(uri || 1) - 1));
    uri = pdf.formatLinkURI({ chapter: 0, page: pageIndex, type: "Fit", x: 0, y: 0, width: 0, height: 0, zoom: 1 });
  }
  page.createLink(rect(transform, object.bounds), uri);
}

function addStamp(page: any, object: Extract<EditorObject, { type: "stamp" }>, transform: AffineMatrix): void {
  const annotation = page.createAnnotation("FreeText");
  setCommon(annotation, object);
  annotation.setRect(rect(transform, object.bounds));
  annotation.setContents(object.label);
  annotation.setDefaultAppearance("Helv", Math.max(9, Math.min(36, (object.bounds.y1 - object.bounds.y0) * 0.42)), color(object.color) ?? [0.1, 0.45, 0.25]);
  const background = color(object.backgroundColor);
  if (background && annotation.hasInteriorColor?.()) annotation.setInteriorColor(background);
  annotation.setColor(color(object.borderColor) ?? [0.1, 0.45, 0.25]);
  setBorder(annotation, 2);
  annotation.update?.();
}

function addSignature(page: any, object: Extract<EditorObject, { type: "signature" }>, transform: AffineMatrix, warnings: string[]): void {
  const annotation = page.createAnnotation("FreeText");
  setCommon(annotation, object);
  annotation.setRect(rect(transform, object.bounds));
  const lines = [object.signerName || "Signature"];
  if (object.showLabels && object.reason) lines.push(`Reason: ${object.reason}`);
  if (object.showLabels && object.location) lines.push(`Location: ${object.location}`);
  if (object.showDate) lines.push(new Date(object.signedAt).toLocaleString("en-GB"));
  annotation.setContents(lines.join("\n"));
  annotation.setDefaultAppearance("TiIt", Math.max(10, Math.min(30, (object.bounds.y1 - object.bounds.y0) * 0.32)), color(object.color) ?? [0.08, 0.12, 0.22]);
  annotation.setColor(color(object.color) ?? [0.08, 0.12, 0.22]);
  setBorder(annotation, 0);
  annotation.update?.();
  warnings.push("Visual signatures are appearance marks only and are not cryptographic digital signatures.");
}

function addRedactionMark(page: any, object: Extract<EditorObject, { type: "redaction" }>, transform: AffineMatrix, warnings: string[]): void {
  const annotation = page.createAnnotation("Redaction");
  setCommon(annotation, object);
  annotation.setRect(rect(transform, object.bounds));
  annotation.setColor(color(object.fillColor) ?? [0, 0, 0]);
  if (object.overlayText) annotation.setContents(object.overlayText);
  annotation.update?.();
  warnings.push("Redaction regions are marked but not applied by ordinary editor export. Use the Secure workspace to remove the underlying content permanently.");
}

function addImage(pdf: any, page: any, object: Extract<EditorObject, { type: "image" }>, transform: AffineMatrix, asset: EditorExportAsset | undefined, warnings: string[]): boolean {
  if (!asset) { warnings.push(`Image asset “${object.name}” was missing and was not exported.`); return false; }
  const annotation = page.createAnnotation("Stamp");
  setCommon(annotation, object);
  const fitzRect = rect(transform, object.bounds);
  annotation.setRect(fitzRect);
  const image = new (mupdf as any).Image(asset.bytes);
  try {
    const imageObject = pdf.addImage(image);
    const xObjects = pdf.newDictionary();
    xObjects.put("Im0", imageObject);
    const resources = pdf.newDictionary();
    resources.put("XObject", xObjects);
    const width = Math.max(1, fitzRect[2] - fitzRect[0]);
    const height = Math.max(1, fitzRect[3] - fitzRect[1]);
    annotation.setAppearance("N", null, (mupdf as any).Matrix.identity, [0, 0, width, height], resources, `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`);
    annotation.setIntent?.("StampImage");
  } finally { image.destroy?.(); }
  return true;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "CANCEL") { cancelled.add(request.requestId); return; }
  const startedAt = performance.now();
  const warnings: string[] = [];
  let pdf: any;
  try {
    assertActive(request.requestId);
    pdf = new (mupdf as any).PDFDocument(new Uint8Array(request.bytes));
    if (pdf.needsPassword?.() && (!request.password || pdf.authenticatePassword(request.password) === 0)) throw new Error("The PDF password is required or incorrect.");
    pdf.disableJS?.();
    const assets = new Map(request.assets.map((asset) => [asset.id, asset]));
    let annotationCount = 0;
    let linkCount = 0;
    let imageCount = 0;
    const byPage = new Map<number, EditorObject[]>();
    for (const object of request.objects.filter((item) => !item.hidden)) {
      const pageObjects = byPage.get(object.pageNumber) ?? [];
      pageObjects.push(object);
      byPage.set(object.pageNumber, pageObjects);
    }
    for (const [pageNumber, objects] of byPage) {
      assertActive(request.requestId);
      if (pageNumber < 1 || pageNumber > pdf.countPages()) { warnings.push(`Objects assigned to missing page ${pageNumber} were skipped.`); continue; }
      const page = pdf.loadPage(pageNumber - 1);
      try {
        const pdfToFitz = invert(page.getTransform() as AffineMatrix);
        for (const object of objects.sort((left, right) => left.zIndex - right.zIndex)) {
          assertActive(request.requestId);
          if (object.rotation !== 0) warnings.push(`Rotation for ${object.type} object ${object.id.slice(0, 8)} is preview-only in this export and was normalized.`);
          switch (object.type) {
            case "text": addText(page, object, pdfToFitz, warnings); annotationCount += 1; break;
            case "image": if (addImage(pdf, page, object, pdfToFitz, assets.get(object.assetId), warnings)) { annotationCount += 1; imageCount += 1; } break;
            case "shape": addShape(page, object, pdfToFitz); annotationCount += 1; break;
            case "ink": addInk(page, object, pdfToFitz); annotationCount += 1; break;
            case "highlight": addHighlight(page, object, pdfToFitz); annotationCount += 1; break;
            case "note": addNote(page, object, pdfToFitz); annotationCount += 1; break;
            case "link": addLink(pdf, page, object, pdfToFitz); linkCount += 1; break;
            case "stamp": addStamp(page, object, pdfToFitz); annotationCount += 1; break;
            case "signature": addSignature(page, object, pdfToFitz, warnings); annotationCount += 1; break;
            case "redaction": addRedactionMark(page, object, pdfToFitz, warnings); annotationCount += 1; break;
          }
        }
      } finally { page.destroy(); }
    }
    // Overlay compilation must produce a complete in-memory PDF. Incremental
    // saves on a buffer-backed MuPDF document can stall in browser workers,
    // and P6 mixed exports no longer need them because native edits are replayed
    // after this overlay stage against the complete saved document.
    const saved = pdf.saveToBuffer("compress=yes,encrypt=keep");
    try {
      const bytes = new Uint8Array(saved.asUint8Array());
      const output = Uint8Array.from(bytes).buffer;
      self.postMessage({
        type: "EDITOR_EXPORT_RESULT",
        requestId: request.requestId,
        output,
        report: {
          objectCount: annotationCount + linkCount,
          annotationCount,
          linkCount,
          imageCount,
          pageCount: pdf.countPages(),
          outputBytes: bytes.byteLength,
          durationMs: performance.now() - startedAt,
          warnings: [...new Set(warnings)]
        }
      }, [output]);
    } finally { saved.destroy(); }
  } catch (error) {
    self.postMessage({ type: "EDITOR_EXPORT_ERROR", requestId: request.requestId, error: error instanceof Error ? { name: error.name, message: error.message } : { name: "UnknownError", message: String(error) } });
  } finally {
    pdf?.destroy?.();
    cancelled.delete(request.requestId);
  }
};

self.postMessage({ type: "EDITOR_EXPORT_READY" });

export {};