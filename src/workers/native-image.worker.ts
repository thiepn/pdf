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

function contentStreams(page: PdfPage): any[] {
  const contents = page.getObject().get("Contents");
  if (!contents || contents.isNull?.()) return [];
  if (contents.isArray?.()) {
    const streams: any[] = [];
    for (let index = 0; index < Number(contents.length ?? 0); index += 1) {
      const item = contents.get(index);
      if (item && !item.isNull?.()) streams.push(item);
    }
    return streams;
  }
  return [contents];
}

function streamText(stream: any): string {
  // Some MuPDF builds expose an indirect /Contents object as a stream only
  // after resolving; others support readStream on the indirect wrapper.
  const resolved = safe(() => stream?.resolve?.() ?? stream, stream);
  const buffer = safe(() => resolved?.readStream?.(), null as any)
    ?? safe(() => stream?.readStream?.(), null as any);
  if (!buffer) return "";
  try {
    const bytes = buffer.asUint8Array();
    let text = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) text += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunk)));
    return text;
  } finally { buffer.destroy?.(); }
}

function stripPdfStringsAndComments(source: string): string {
  let output = "";
  let index = 0;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (code === 37) {
      while (index < source.length && ![10, 13].includes(source.charCodeAt(index))) index += 1;
      output += " ";
      continue;
    }
    if (code === 40) {
      let depth = 1;
      index += 1;
      while (index < source.length && depth > 0) {
        const current = source.charCodeAt(index);
        if (current === 92) { index += 2; continue; }
        if (current === 40) depth += 1;
        else if (current === 41) depth -= 1;
        index += 1;
      }
      output += " ";
      continue;
    }
    if (code === 60 && source.charCodeAt(index + 1) !== 60) {
      index += 1;
      while (index < source.length && source.charCodeAt(index) !== 62) index += 1;
      index = Math.min(source.length, index + 1);
      output += " ";
      continue;
    }
    output += source[index++];
  }
  return output;
}

function pageResources(page: PdfPage): any {
  const object = page.getObject();
  const direct = object.get("Resources");
  const resolved = direct?.resolve?.() ?? direct;
  if (resolved?.isDictionary?.()) return resolved;
  const inherited = object.getInheritable?.("Resources");
  return inherited?.resolve?.() ?? inherited;
}

function resourceDictionary(page: PdfPage, category: string): any {
  const raw = pageResources(page)?.get?.(category);
  return raw?.resolve?.() ?? raw;
}

function blendModeForExtGState(page: PdfPage, name: string): string {
  return safe(() => {
    const state = resourceDictionary(page, "ExtGState")?.get?.(name);
    const resolved = state?.resolve?.() ?? state;
    const bm = resolved?.get?.("BM");
    const first = bm?.isArray?.() ? bm.get(0) : bm;
    return String(first?.asName?.() ?? first?.valueOf?.() ?? "Normal").replace(/^\//, "") || "Normal";
  }, "Normal");
}

function isImageXObject(page: PdfPage, name: string): boolean {
  return safe(() => {
    const raw = resourceDictionary(page, "XObject")?.get?.(name);
    const object = raw?.resolve?.() ?? raw;
    const subtype = object?.get?.("Subtype");
    return String(subtype?.asName?.() ?? subtype?.valueOf?.() ?? "").replace(/^\//, "") === "Image";
  }, false);
}

function imageXObjectMaskEvidence(page: PdfPage, name: string): { softMask: boolean; explicitMask: boolean } {
  return safe(() => {
    const raw = resourceDictionary(page, "XObject")?.get?.(name);
    const object = raw?.resolve?.() ?? raw;
    const present = (value: any): boolean => {
      if (!value || value.isNull?.()) return false;
      const literal = String(value?.valueOf?.() ?? value).replace(/^\//, "");
      return literal !== "None" && literal !== "null";
    };
    const imageMaskValue = object?.get?.("ImageMask");
    const imageMaskLiteral = String(imageMaskValue?.valueOf?.() ?? imageMaskValue ?? "").toLowerCase();
    return {
      softMask: present(object?.get?.("SMask")),
      explicitMask: present(object?.get?.("Mask")) || imageMaskLiteral === "true"
    };
  }, { softMask: false, explicitMask: false });
}

/**
 * Read direct page-content graphics-state transitions for image invocations.
 * Device tracing still supplies geometry/mask/clip evidence. This parser exists
 * specifically because non-Normal /BM is content-stream state and should not
 * depend on whether a renderer chooses to expose it as beginGroup().
 */
function directImagePaints(page: PdfPage): Array<{ resourceName: string; blendMode: string; softMask: boolean; explicitMask: boolean; clipped: boolean }> {
  const paints: Array<{ resourceName: string; blendMode: string; softMask: boolean; explicitMask: boolean; clipped: boolean }> = [];
  for (const stream of contentStreams(page)) {
    const source = stripPdfStringsAndComments(streamText(stream));
    const tokens = source.match(/\/[A-Za-z0-9_.:+-]+|W\*|\b(?:q|Q|gs|Do|W)\b/g) ?? [];
    const stack: Array<{ blendMode: string; clipped: boolean }> = [];
    let blendMode = "Normal";
    let clipped = false;
    let name: string | undefined;
    for (const token of tokens) {
      if (token.startsWith("/")) { name = token.slice(1); continue; }
      if (token === "q") { stack.push({ blendMode, clipped }); name = undefined; continue; }
      if (token === "Q") {
        const previous = stack.pop();
        blendMode = previous?.blendMode ?? "Normal";
        clipped = previous?.clipped ?? false;
        name = undefined;
        continue;
      }
      if (token === "W" || token === "W*") { clipped = true; name = undefined; continue; }
      if (token === "gs") {
        if (name) blendMode = blendModeForExtGState(page, name);
        name = undefined;
        continue;
      }
      if (token === "Do") {
        if (name && isImageXObject(page, name)) paints.push({ resourceName: name, blendMode, clipped, ...imageXObjectMaskEvidence(page, name) });
        name = undefined;
      }
    }
  }
  return paints;
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

function imageEvidenceOverlap(first: NativeRect, second: NativeRect): number {
  const x0 = Math.max(first.x, second.x);
  const y0 = Math.max(first.y, second.y);
  const x1 = Math.min(first.x + first.w, second.x + second.w);
  const y1 = Math.min(first.y + first.h, second.y + second.h);
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const reference = Math.max(1, Math.min(first.w * first.h, second.w * second.h));
  return intersection / reference;
}

function structuredImageEvidence(page: PdfPage): Array<{ bounds: NativeRect; softMask: boolean; explicitMask: boolean }> {
  const output: Array<{ bounds: NativeRect; softMask: boolean; explicitMask: boolean }> = [];
  const structured = page.toStructuredText("preserve-images");
  try {
    structured.walk({
      onImageBlock(bbox: unknown, _transform: unknown, image: any) {
        const mask = safe(() => image?.getMask?.(), null as any);
        const softMask = Boolean(mask);
        mask?.destroy?.();
        output.push({
          bounds: rectFromArray(bbox),
          softMask,
          explicitMask: safe(() => Boolean(image?.getImageMask?.()), false)
        });
      }
    });
  } finally {
    structured.destroy?.();
  }
  return output;
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
    // Images painted while a soft mask is being defined are mask source content,
    // not ordinary page-image instances that should be selectable/editable.
    if (definingMaskDepth > 0) return;
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
      clipped: clipKinds.includes("clip"),
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
    beginGroup: (...args: unknown[]) => {
      // MuPDF builds differ on whether a color-space argument precedes
      // isolated/knockout. Never misinterpret a boolean as a blend mode.
      const offset = args.length >= 6 ? 1 : 0;
      const mode = args[3 + offset];
      const alpha = args[4 + offset];
      const blendMode = typeof mode === "string" ? mode.replace(/^\//, "") || "Normal" : "Normal";
      groups.push({ blendMode, alpha: typeof alpha === "number" && Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1 });
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

  let traceDevice: any;
  try {
    traceDevice = new (mupdf as any).Device(device);
    if (typeof page.runPageContents === "function") page.runPageContents(traceDevice, (mupdf as any).Matrix.identity);
    else page.run(traceDevice, (mupdf as any).Matrix.identity);
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
    } finally {
      structured.destroy?.();
    }
  } finally {
    traceDevice?.destroy?.();
  }

  const counts = new Map<number, number>();
  for (const trace of traces) counts.set(trace.key, (counts.get(trace.key) ?? 0) + 1);
  const structuredEvidence = structuredImageEvidence(page);
  const structuredMatches = traces.map((trace) => {
    const match = structuredEvidence
      .map((candidate) => ({ candidate, score: imageEvidenceOverlap(trace.bounds, candidate.bounds) }))
      .sort((first, second) => second.score - first.score)[0];
    return match && match.score >= 0.8 ? match.candidate : undefined;
  });
  const visibleTraceIndexes = structuredMatches.flatMap((match, index) => match ? [index] : []);
  const directPaints = directImagePaints(page);
  const directBlendHasRisk = directPaints.some((paint) => paint.blendMode !== "Normal");
  const paintMappingAvailable = directPaints.length === visibleTraceIndexes.length;
  const directPaintByTrace = new Map<number, (typeof directPaints)[number]>();
  if (paintMappingAvailable) visibleTraceIndexes.forEach((traceIndex, paintIndex) => directPaintByTrace.set(traceIndex, directPaints[paintIndex]));
  const blendMappingAmbiguous = directBlendHasRisk && !paintMappingAvailable;
  const resourceCounts = new Map<string, number>();
  for (const paint of directPaints) resourceCounts.set(paint.resourceName, (resourceCounts.get(paint.resourceName) ?? 0) + 1);
  if (blendMappingAmbiguous) warnings.push(`Page ${pageNumber} uses non-Normal image blend state but visible structured-image count differs from direct image invocation count; affected image mutation is fail-closed as ambiguous.`);
  const images = traces.map((trace, index): NativeImageObject => {
    const paint = directPaintByTrace.get(index);
    const structuredMask = structuredMatches[index];
    const mappedBlend = paint?.blendMode ?? trace.blendMode;
    const classified = classifyImageFidelity({
      resourceName: paint?.resourceName,
      invocationCount: paint ? (resourceCounts.get(paint.resourceName) ?? 1) : (counts.get(trace.key) ?? 1),
      softMask: trace.softMask || Boolean(paint?.softMask) || Boolean(structuredMask?.softMask),
      explicitMask: trace.explicitMask || Boolean(paint?.explicitMask) || Boolean(structuredMask?.explicitMask),
      // A transparency-mask device group can introduce an internal clip
      // without a PDF clipping operator. When an exact direct Do mapping
      // exists, trust its explicit W/W* state; otherwise remain conservative.
      clipped: paint ? paint.clipped : trace.clipped,
      blendMode: paint ? paint.blendMode : trace.blendMode,
      ambiguous: blendMappingAmbiguous
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

function imageDrawingContent(pdf: PdfDocument, page: PdfPage, resource: string, intrinsicWidth: number, intrinsicHeight: number, edit: NativeImageEdit): string {
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
  return `q${clip ? ` ${x0} ${y0} ${boxWidth} ${boxHeight} re W n` : ""}${gs ? ` /${gs} gs` : ""} ${matrix} cm /${resource} Do Q\n`;
}

function drawImageObject(pdf: PdfDocument, page: PdfPage, imageObject: any, intrinsicWidth: number, intrinsicHeight: number, edit: NativeImageEdit): void {
  const dictionary = resources(pdf, page, "XObject");
  const resource = `LPSIMG${++sequence}`;
  dictionary.put(resource, imageObject);
  append(pdf, page, imageDrawingContent(pdf, page, resource, intrinsicWidth, intrinsicHeight, edit));
}

function streamReferenceIdentity(object: any): string | undefined {
  const value = String(object?.valueOf?.() ?? "");
  return /^\d+\s+\d+\s+R$/.test(value) ? value : undefined;
}

function referencesContentStream(contents: any, identity: string): boolean {
  if (!contents || contents.isNull?.()) return false;
  if (contents.isArray?.()) {
    for (let index = 0; index < Number(contents.length ?? 0); index += 1) {
      if (streamReferenceIdentity(contents.get(index)) === identity) return true;
    }
    return false;
  }
  return streamReferenceIdentity(contents) === identity;
}

/**
 * Change only one qualified direct XObject invocation. Image-only redaction
 * can remove sibling uses of a shared /SMask resource, which is unacceptable.
 * This intentionally handles only simple, ASCII, single-stream q/cm/Do/Q
 * sequences. Complex/multiple-stream PDF operators remain fail-closed.
 */
function rewriteDirectMaskedInvocation(pdf: PdfDocument, page: PdfPage, image: NativeImageObject, edit: NativeImageEdit, action: "transform" | "delete"): void {
  const resourceName = image.fidelity?.resourceName;
  if (!resourceName || !image.fidelity?.softMask || image.fidelity.explicitMask || image.fidelity.clipped || image.fidelity.blendMode !== "Normal") {
    throw new Error("The masked image does not have a qualified direct source invocation; its original content was not modified.");
  }
  const pageObject = page.getObject();
  const current = pageObject.get("Contents");
  if (!current || current.isNull?.() || current.isArray?.()) {
    throw new Error("The masked image uses multiple or missing page-content streams. Editing is blocked to preserve other image instances.");
  }
  // In-place updates to an indirect stream must never change another page.
  // Shared /Contents references are rare but legitimate: preserve them by
  // refusing the mutation rather than modifying every referencing page.
  const identity = streamReferenceIdentity(current);
  if (!identity) throw new Error("The masked image content stream cannot be identified safely.");
  for (let index = 0; index < pdf.countPages(); index += 1) {
    if (index === image.pageNumber - 1) continue;
    const otherPage = pdf.loadPage(index);
    try {
      if (referencesContentStream(otherPage.getObject().get("Contents"), identity)) {
        throw new Error("The masked image shares its content stream with another page; this edit is blocked to preserve the other page.");
      }
    } finally { otherPage.destroy?.(); }
  }
  const source = streamText(current);
  if (!source || /[^\x09\x0a\x0d\x20-\x7e]/.test(source)) {
    throw new Error("The masked image has unsupported binary page-content operators. Its source was preserved.");
  }
  // The direct-content parser supports only simple, explicit PDF resource names.
  if (!/^[A-Za-z0-9_.:+-]+$/.test(resourceName)) {
    throw new Error("The masked image resource has an unsupported name and cannot be rewritten safely.");
  }
  const escaped = resourceName;
  const number = "([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))";
  const invocation = new RegExp(`\\bq\\s+${Array(6).fill(number).join("\\s+")}\\s+cm\\s+/${escaped}\\s+Do\\s+Q\\b`, "g");
  const requested = pdfRect(page, edit.sourceBounds ?? image.bounds);
  const matches = Array.from(source.matchAll(invocation)).map((match) => {
    const matrix = match.slice(1, 7).map(Number);
    const bounds = imageBoundsFromMatrix(matrix);
    const score = Math.abs(bounds.x - requested[0]) + Math.abs(bounds.y - requested[1])
      + Math.abs(bounds.x + bounds.w - requested[2]) + Math.abs(bounds.y + bounds.h - requested[3]);
    return { start: match.index ?? -1, length: match[0].length, score };
  }).sort((a, b) => a.score - b.score);
  if (!matches.length || matches[0].start < 0 || matches[0].score > 5 || (matches[1] && Math.abs(matches[1].score - matches[0].score) < 2)) {
    throw new Error("The selected masked-image invocation could not be uniquely matched; no source PDF operators were changed.");
  }
  const target = matches[0];
  const drawing = action === "delete" ? "q Q\n" : imageDrawingContent(pdf, page, resourceName, image.width ?? 1, image.height ?? 1, edit);
  const rewritten = source.slice(0, target.start) + drawing + source.slice(target.start + target.length);
  // Preserve the existing /Contents stream reference and its page-resource
  // relationships. It also avoids introducing another indirect stream when
  // the existing one can be safely rewritten in place.
  // A single direct stream is required above; never rewrite stream arrays.
  if (!current.isStream?.() || typeof current.writeStream !== "function") {
    throw new Error("The masked image content stream cannot be rewritten safely; the source remains unchanged.");
  }
  // Match the engine-level round-trip regression: use MuPDF's own Buffer
  // so the native stream writer sees a Wasm-owned buffer, not an external
  // JS typed-array view whose lifetime/realm may differ across workers.
  const nativeBytes = new (mupdf as any).Buffer(rewritten);
  try { current.writeStream(nativeBytes); }
  finally { nativeBytes.destroy(); }
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
          if (!allowedActions.includes(action) || (action === "replace" && (current.image.fidelity?.softMask || current.image.fidelity?.explicitMask))) throw new Error(current.image.fidelity?.reason ?? "This image operation is fidelity-protected and cannot be applied safely.");
          const sourceRects = imageRects(page);
          const sourceMatches = sourceRects.filter((rect) => intersectionRatio(rect, sourceBounds) >= 0.5);
          const removesSourceRegion = action === "transform" || action === "delete" || (action === "replace" && edit.removeUnderlying !== false);
          if (removesSourceRegion && sourceMatches.length !== 1) throw new Error("The selected image region overlaps multiple source image instances; destructive reconstruction is blocked to avoid collateral image removal.");
          beforeRects.set(edit.id, sourceRects);
          beforeClasses.set(edit.id, current.image.fidelity?.class);
          beforeCounts.set(edit.id, sourceMatches.length);
          if (current.image.fidelity?.class === "masked" && (action === "transform" || action === "delete")) {
            rewriteDirectMaskedInvocation(pdf, page, current.image, edit, action);
            changed.add(edit.pageNumber);
            continue;
          }
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
            // MuPDF's structured-text JSON can omit masked images after a
            // rewritten /Contents stream even while the actual page paint
            // operators and attached /SMask are still present. For the P17
            // direct-invocation path, verify every painted image with the
            // same graphics-state Device used to qualify the source edit.
            // Never lower the expected count or waive sibling positions.
            const maskedInspection = beforeClasses.get(edit.id) === "masked"
              ? inspectImagePage(page, edit.pageNumber)
              : undefined;
            const rects = maskedInspection
              ? maskedInspection.images.map((image) => image.bounds)
              : imageRects(page);
            const action = edit.action ?? (edit.bytes?.byteLength ? "replace" : "transform");
            const sourceBounds = edit.sourceBounds ?? edit.bounds;
            const originals = beforeRects.get(edit.id) ?? [];
            const sourceCount = beforeCounts.get(edit.id) ?? 0;
            const expectedMinimum = Math.max(0, originals.length - sourceCount + (action === "delete" ? 0 : 1));
            if (rects.length < expectedMinimum) {
              const outputPaints = directImagePaints(page);
              const structuredCount = imageRects(page).length;
              const maskedCount = maskedInspection?.images.filter((image) => image.fidelity?.softMask).length ?? -1;
              const directMaskedPaints = outputPaints.filter((paint) => paint.softMask).length;
              throw new Error(`Image edit validation failed on page ${edit.pageNumber}: unrelated image instances disappeared (expected at least ${expectedMinimum} painted instances; observed ${rects.length}; structured ${structuredCount}; direct paints ${outputPaints.length} including ${directMaskedPaints} with attached masks; observed masked ${maskedCount}; originally ${originals.length}; source-region matches ${sourceCount}; device warnings ${maskedInspection?.warnings.length ?? 0}).`);
            }
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
