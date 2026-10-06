import * as mupdf from "mupdf";
import { rectFromArray } from "../native/nativeModel";
import { classifyImageFidelity } from "../native/nativeFidelity";
import type { NativeExportReport, NativeImageEdit, NativeImageFidelityClass, NativeImageObject, NativeImageRotation, NativeRect } from "../types/nativeEditor";

type Request =
  | { type: "INSPECT_IMAGES"; requestId: string; bytes: ArrayBuffer; password?: string }
  | { type: "APPLY_IMAGES"; requestId: string; bytes: ArrayBuffer; password?: string; edits: NativeImageEdit[] }
  | { type: "CANCEL"; requestId: string };

interface ImageInspection {
  pages: Array<{ pageNumber: number; images: NativeImageObject[]; warnings: string[] }>;
  total: number;
  warnings: string[];
}

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

function imageBoundsFromMatrix(matrix: number[]): NativeRect {
  const points = [
    point(matrix, 0, 0),
    point(matrix, 1, 0),
    point(matrix, 1, 1),
    point(matrix, 0, 1)
  ];
  const x0 = Math.min(...points.map((value) => value[0]));
  const y0 = Math.min(...points.map((value) => value[1]));
  const x1 = Math.max(...points.map((value) => value[0]));
  const y1 = Math.max(...points.map((value) => value[1]));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function inspectImagePage(page: PdfPage, pageNumber: number): { images: NativeImageObject[]; warnings: string[] } {
  type Trace = {
    image: any;
    bounds: NativeRect;
    alpha: number;
    clipped: boolean;
    softMask: boolean;
    explicitMask: boolean;
    blendMode: string;
    key: number;
  };
  const traces: Trace[] = [];
  const warnings: string[] = [];
  const clipKinds: Array<"clip" | "soft-mask"> = [];
  const groups: Array<{ blendMode: string; alpha: number }> = [];
  const imageKeys = new WeakMap<object, number>();
  let nextKey = 1;
  let definingMaskDepth = 0;

  const keyFor = (image: any): number => {
    if (!image || (typeof image !== "object" && typeof image !== "function")) return nextKey++;
    const known = imageKeys.get(image);
    if (known) return known;
    const key = nextKey++;
    imageKeys.set(image, key);
    return key;
  };
  const activeBlend = (): { blendMode: string; alpha: number } => {
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const group = groups[index];
      if (group.blendMode !== "Normal" || group.alpha < 0.999) return group;
    }
    return { blendMode: "Normal", alpha: 1 };
  };
  const record = (image: any, ctm: number[], alpha: number, explicitMask = false) => {
    const mask = safe(() => image?.getMask?.(), null as any);
    const attachedMask = Boolean(mask);
    mask?.destroy?.();
    const imageMask = explicitMask || safe(() => Boolean(image?.getImageMask?.()), false);
    const group = activeBlend();
    const effectiveAlpha = Math.min(Number.isFinite(alpha) ? alpha : 1, group.alpha);
    traces.push({
      image,
      bounds: imageBoundsFromMatrix(ctm),
      alpha: effectiveAlpha,
      clipped: clipKinds.length > 0,
      softMask: attachedMask || definingMaskDepth > 0 || clipKinds.includes("soft-mask"),
      explicitMask: imageMask,
      blendMode: group.blendMode !== "Normal" ? group.blendMode : effectiveAlpha < 0.999 ? "Alpha" : "Normal",
      key: keyFor(image)
    });
  };

  const noOp = () => {};
  const device: Record<string, (...args: any[]) => any> = {
    fillPath: noOp,
    strokePath: noOp,
    fillText: noOp,
    strokeText: noOp,
    ignoreText: noOp,
    fillShade: noOp,
    clipPath: () => { clipKinds.push("clip"); },
    clipStrokePath: () => { clipKinds.push("clip"); },
    clipText: () => { clipKinds.push("clip"); },
    clipStrokeText: () => { clipKinds.push("clip"); },
    clipImageMask: () => { clipKinds.push("clip"); },
    popClip: () => { clipKinds.pop(); },
    beginMask: () => { definingMaskDepth += 1; },
    endMask: () => {
      definingMaskDepth = Math.max(0, definingMaskDepth - 1);
      clipKinds.push("soft-mask");
    },
    beginGroup: (_area: unknown, _isolated: unknown, _knockout: unknown, blendMode: unknown, alpha: unknown) => {
      groups.push({ blendMode: String(blendMode ?? "Normal").replace(/^\//, "") || "Normal", alpha: Number.isFinite(Number(alpha)) ? Math.max(0, Math.min(1, Number(alpha))) : 1 });
    },
    endGroup: () => { groups.pop(); },
    fillImage: (image: any, ctm: number[], alpha: number) => record(image, ctm, alpha, false),
    fillImageMask: (image: any, ctm: number[], _colorSpace: unknown, _color: unknown, alpha: number) => record(image, ctm, alpha, true),
    beginTile: () => 0,
    endTile: noOp,
    beginLayer: noOp,
    endLayer: noOp,
    beginStructure: noOp,
    endStructure: noOp,
    beginMetatext: noOp,
    endMetatext: noOp,
    renderFlags: noOp,
    setDefaultColorSpaces: noOp,
    close: noOp
  };

  try {
    if (typeof page.runPageContents === "function") page.runPageContents(device, (mupdf as any).Matrix.identity);
    else page.run(device, (mupdf as any).Matrix.identity);
  } catch (error) {
    warnings.push(`Page ${pageNumber} image graphics-state trace failed; image mutation is disabled for this page to preserve unknown masks/clipping/blending (${error instanceof Error ? error.message : String(error)}).`);
    const structured = page.toStructuredText("preserve-images");
    try {
      const fallback: NativeImageObject[] = [];
      structured.walk({
        onImageBlock: (bbox: unknown, _transform: unknown, image: any) => {
          const mask = safe(() => image?.getMask?.(), null as any);
          const softMask = Boolean(mask);
          mask?.destroy?.();
          const evidence = classifyImageFidelity({ softMask, explicitMask: safe(() => Boolean(image?.getImageMask?.()), false), ambiguous: true });
          fallback.push({
            id: `p${pageNumber}:image:${fallback.length}`,
            type: "image",
            pageNumber,
            bounds: rectFromArray(bbox),
            width: safe(() => Number(image.getWidth()), undefined as unknown as number),
            height: safe(() => Number(image.getHeight()), undefined as unknown as number),
            ...evidence
          });
        }
      });
      return { images: fallback, warnings };
    } finally { structured.destroy?.(); }
  }

  const counts = new Map<number, number>();
  for (const trace of traces) counts.set(trace.key, (counts.get(trace.key) ?? 0) + 1);
  const images = traces.map((trace, index): NativeImageObject => {
    const classified = classifyImageFidelity({
      invocationCount: counts.get(trace.key) ?? 1,
      softMask: trace.softMask,
      explicitMask: trace.explicitMask,
      clipped: trace.clipped,
      blendMode: trace.blendMode
    });
    return {
      id: `p${pageNumber}:image:${index}`,
      type: "image",
      pageNumber,
      bounds: trace.bounds,
      width: safe(() => Number(trace.image?.getWidth?.()), undefined as unknown as number),
      height: safe(() => Number(trace.image?.getHeight?.()), undefined as unknown as number),
      ...classified
    };
  });
  const protectedCount = images.filter((image) => image.editability === "fidelity-protected").length;
  const sharedCount = images.filter((image) => image.fidelity?.class === "shared").length;
  if (protectedCount) warnings.push(`Page ${pageNumber} has ${protectedCount} image instance${protectedCount === 1 ? "" : "s"} protected from mutation because masks, clipping, blending, or ambiguous graphics state must be preserved.`);
  if (sharedCount) warnings.push(`Page ${pageNumber} has ${sharedCount} shared image invocation${sharedCount === 1 ? "" : "s"}; edits use instance-local reconstruction instead of mutating the shared source resource.`);
  return { images, warnings };
}

function inspectImages(pdf: PdfDocument, requestId: string): ImageInspection {
  const pages: ImageInspection["pages"] = [];
  const warnings: string[] = [];
  let total = 0;
  for (let index = 0; index < pdf.countPages(); index += 1) {
    active(requestId);
    const page = pdf.loadPage(index);
    try {
      const result = inspectImagePage(page, index + 1);
      pages.push({ pageNumber: index + 1, ...result });
      total += result.images.length;
      warnings.push(...result.warnings);
    } finally { page.destroy?.(); }
  }
  return { pages, total, warnings };
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
  // P3 source transforms do not need a document-wide clean pass, annotation
  // appearance rebuild, or image/font recompression. Those aggressive save
  // options rewrite unrelated object graphs and make a subsequent P6 overlay
  // pass unnecessarily expensive. Garbage collection still removes unreachable
  // redacted image objects; the writer immediately reopens and validates output.
  const buffer = pdf.saveToBuffer("garbage=4,compress=yes,encrypt=keep");
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
      if (request.type === "INSPECT_IMAGES") {
        self.postMessage({ type: "IMAGE_INSPECTION", requestId: request.requestId, inspection: inspectImages(pdf, request.requestId) });
        return;
      }
      const changed = new Set<number>();
      const beforeCounts = new Map<string, number>();
      const beforeRects = new Map<string, NativeRect[]>();
      const beforeClasses = new Map<string, NativeImageFidelityClass | undefined>();

      for (const edit of request.edits) {
        active(request.requestId);
        const page = pdf.loadPage(edit.pageNumber - 1);
        try {
          const sourceBounds = edit.sourceBounds ?? edit.bounds;
          const current = inspectImagePage(page, edit.pageNumber).images
            .map((image) => ({ image, score: rectDistance(image.bounds, sourceBounds) }))
            .sort((left, right) => left.score - right.score)[0];
          if (!current || current.score > 4) throw new Error("The selected source image could not be matched safely before export.");
          const action = edit.action ?? (edit.bytes?.byteLength ? "replace" : "transform");
          const allowedActions = current.image.fidelity?.allowedActions ?? (current.image.editability === "replace-region" ? ["transform", "replace", "delete"] : []);
          if (!allowedActions.includes(action)) throw new Error(current.image.fidelity?.reason ?? "This image operation is fidelity-protected and cannot be applied safely.");
          const sourceRects = imageRects(page);
          beforeRects.set(edit.id, sourceRects);
          beforeClasses.set(edit.id, current.image.fidelity?.class);
          beforeCounts.set(edit.id, sourceRects.filter((rect) => intersectionRatio(rect, sourceBounds) >= 0.5).length);
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
            const sourceBounds = edit.sourceBounds ?? edit.bounds;
            const originals = beforeRects.get(edit.id) ?? [];
            const sourceCount = beforeCounts.get(edit.id) ?? 0;
            const expectedMinimum = Math.max(0, originals.length - sourceCount + (action === "delete" ? 0 : 1));
            if (rects.length < expectedMinimum) throw new Error(`Image edit validation failed on page ${edit.pageNumber}: unrelated image instances disappeared.`);
            for (const original of originals.filter((rect) => intersectionRatio(rect, sourceBounds) < 0.5)) {
              if (!rects.some((candidate) => rectDistance(candidate, original) <= 4)) throw new Error(`Image edit validation failed on page ${edit.pageNumber}: an untouched image instance changed position or disappeared.`);
            }
            if (beforeClasses.get(edit.id) === "masked" && action === "transform") {
              const inspected = inspectImagePage(page, edit.pageNumber).images
                .map((image) => ({ image, score: rectDistance(image.bounds, edit.bounds) }))
                .sort((left, right) => left.score - right.score)[0];
              if (!inspected || inspected.score > 4 || inspected.image.fidelity?.class !== "masked") throw new Error(`Masked image transform did not preserve its attached soft mask on page ${edit.pageNumber}.`);
            }
            if (action === "delete") {
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
        if (sourceTransforms) warnings.push("Existing image content was reused locally for source transforms. Attached soft masks are revalidated after reopening; PDF optimization may recompress the image stream even when visible pixels are unchanged.");
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
