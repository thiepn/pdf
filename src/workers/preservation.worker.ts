import * as mupdf from "mupdf";
import { addFingerprint, aggregateCategoryFingerprints, comparePreservationGraphs, createObjectMap, hashBytes, hashText } from "../preservation/fingerprint";
import { preservationPolicy } from "../preservation/policies";
import type { GraphCounts, ImageOptimizationSettings, ImpositionSettings, OcrOverlayPage, PreservationGraph } from "../types/preservation";

type Request =
  | { type: "INSPECT" | "OCR_OVERLAY" | "OPTIMIZE" | "IMPOSE"; requestId: string; bytes: ArrayBuffer; password?: string; pages?: OcrOverlayPage[]; settings?: ImageOptimizationSettings | ImpositionSettings }
  | { type: "CANCEL"; requestId: string };

const cancelled = new Set<string>();

function active(id: string): void {
  if (cancelled.has(id)) throw new DOMException("Operation cancelled.", "AbortError");
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function authenticate(pdf: any, password?: string): void {
  if (pdf.needsPassword?.() && (!password || pdf.authenticatePassword(password) === 0)) throw new Error("The PDF password is required or incorrect.");
}

function stringValue(value: any): string {
  return safe(() => String(value?.asString?.() ?? value?.asName?.() ?? value?.valueOf?.() ?? value ?? ""), "");
}

function streamBytes(value: any): Uint8Array | null {
  const stream = safe(() => value?.readStream?.() ?? null, null as any);
  if (stream instanceof Uint8Array) return stream;
  if (stream instanceof ArrayBuffer) return new Uint8Array(stream);
  const nested = safe(() => stream?.asUint8Array?.(), null as Uint8Array | null);
  return nested instanceof Uint8Array ? nested : null;
}

function streamDigest(value: any): string {
  const bytes = streamBytes(value);
  if (bytes) return hashBytes(bytes);
  const text = safe(() => typeof value?.readStream?.() === "string" ? value.readStream() : "", "");
  return text ? hashText(text) : hashText(stringValue(value));
}

function streamText(value: any): string {
  const direct = safe(() => value?.readStream?.(), null as any);
  if (typeof direct === "string") return direct;
  if (direct instanceof Uint8Array) return new TextDecoder("latin1").decode(direct);
  if (direct instanceof ArrayBuffer) return new TextDecoder("latin1").decode(new Uint8Array(direct));
  const nested = safe(() => direct?.asUint8Array?.(), null as Uint8Array | null);
  return nested instanceof Uint8Array ? new TextDecoder("latin1").decode(nested) : "";
}

function contentText(value: any): string {
  if (!value) return "";
  const direct = streamText(value);
  if (direct) return direct;
  if (!value.isArray?.()) return "";
  const parts: string[] = [];
  safe(() => value.forEach?.((item: any) => { const part = contentText(item); if (part) parts.push(part); }), undefined);
  if (!parts.length) {
    const length = Number(value.length ?? safe(() => value.size?.(), 0));
    for (let index = 0; index < length; index += 1) {
      const part = contentText(safe(() => value.get?.(index), null));
      if (part) parts.push(part);
    }
  }
  return parts.join("\n");
}

function roundRect(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((item) => typeof item === "number" ? Number(item.toFixed(3)) : item).join(",");
}

function lineText(line: any): string {
  const spans = Array.isArray(line?.spans) ? line.spans : [];
  return spans.map((span: any) => {
    if (typeof span?.text === "string") return span.text;
    if (Array.isArray(span?.chars)) return span.chars.map((char: any) => char?.c ?? char?.char ?? "").join("");
    return "";
  }).join("");
}

function imageSemantic(block: any): string {
  const payload = typeof block?.image === "string" ? `:${hashText(block.image)}` : "";
  return JSON.stringify({
    bbox: roundRect(block?.bbox),
    transform: roundRect(block?.transform),
    width: block?.width ?? block?.w ?? null,
    height: block?.height ?? block?.h ?? null,
    colorspace: block?.colorspace ?? block?.cs ?? null,
    bpc: block?.bpc ?? null,
    xres: block?.xres ?? null,
    yres: block?.yres ?? null
  }) + payload;
}

function vectorOperations(contentText: string): string[] {
  const operator = "(?:m|l|c|v|y|re|h|S|s|f\\*?|B\\*?|b\\*?|n|w|J|j|M|d|G|g|RG|rg|K|k)";
  const pattern = new RegExp(`(?:[-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?\\s+){0,8}${operator}\\b`, "g");
  return (contentText.match(pattern) ?? []).map((item) => item.trim().replace(/\s+/g, " "));
}

function flattenOutline(items: any[], prefix = ""): Array<{ id: string; semantic: string }> {
  const result: Array<{ id: string; semantic: string }> = [];
  items.forEach((item, index) => {
    const id = `${prefix}${index + 1}`;
    const children = item?.down ?? item?.children ?? item?.items ?? [];
    result.push({ id, semantic: JSON.stringify({ title: item?.title ?? "", uri: item?.uri ?? "", page: item?.page ?? null, x: item?.x ?? null, y: item?.y ?? null }) });
    result.push(...flattenOutline(Array.isArray(children) ? children : [], `${id}.`));
  });
  return result;
}

function graph(pdf: any, requestId: string): PreservationGraph {
  const counts: GraphCounts = { pages: pdf.countPages(), text: 0, images: 0, vectors: 0, fonts: 0, annotations: 0, forms: 0, links: 0, bookmarks: 0, attachments: 0, layers: 0, metadata: 0, signatures: 0, tags: 0, encryption: pdf.needsPassword?.() ? 1 : 0 };
  const objects = createObjectMap();
  const fontBySemantic = new Map<string, string>();

  for (let index = 0; index < pdf.countPages(); index += 1) {
    active(requestId);
    const pageNumber = index + 1;
    const page = pdf.loadPage(index);
    try {
      const bounds = safe(() => page.getBounds(), [] as number[]);
      const rotation = safe(() => page.getObject()?.get?.("Rotate")?.asNumber?.() ?? 0, 0);
      addFingerprint(objects, "pages", `page:${pageNumber}`, `${roundRect(bounds)}|rotate:${rotation}`, pageNumber, `Page ${pageNumber}`);

      const structured = page.toStructuredText("preserve-images,preserve-spans");
      try {
        const data = JSON.parse(structured.asJSON(1));
        let lineIndex = 0;
        let imageIndex = 0;
        for (const block of data.blocks ?? []) {
          if (block.type === "text") {
            for (const line of block.lines ?? []) {
              lineIndex += 1;
              counts.text += 1;
              const text = lineText(line);
              addFingerprint(objects, "text", `page:${pageNumber}:line:${lineIndex}`, `${roundRect(line?.bbox)}|${text}`, pageNumber, text.slice(0, 80));
            }
          } else if (block.type === "image") {
            imageIndex += 1;
            counts.images += 1;
            addFingerprint(objects, "images", `page:${pageNumber}:image:${imageIndex}`, imageSemantic(block), pageNumber, `Image ${imageIndex}`);
          }
        }
      } finally { structured.destroy?.(); }

      const resources = page.getObject()?.getInheritable?.("Resources");
      resources?.get?.("Font")?.forEach?.((fontObject: any, resourceName: string) => {
        const semantic = JSON.stringify({
          baseFont: stringValue(fontObject?.get?.("BaseFont")),
          subtype: stringValue(fontObject?.get?.("Subtype")),
          encoding: stringValue(fontObject?.get?.("Encoding")),
          descendant: stringValue(fontObject?.get?.("DescendantFonts"))
        });
        if (!fontBySemantic.has(semantic)) fontBySemantic.set(semantic, `font:${fontBySemantic.size + 1}:${resourceName}`);
      });
      resources?.get?.("XObject")?.forEach?.((object: any, resourceName: string) => {
        if (!/Image/i.test(stringValue(object?.get?.("Subtype")))) return;
        const semantic = JSON.stringify({
          width: stringValue(object?.get?.("Width")),
          height: stringValue(object?.get?.("Height")),
          colorSpace: stringValue(object?.get?.("ColorSpace")),
          bitsPerComponent: stringValue(object?.get?.("BitsPerComponent")),
          decode: stringValue(object?.get?.("Decode")),
          imageMask: stringValue(object?.get?.("ImageMask")),
          pixels: streamDigest(object)
        });
        addFingerprint(objects, "images", `page:${pageNumber}:xobject:${resourceName}`, semantic, pageNumber, `Image resource ${resourceName}`);
      });

      const contents = page.getObject()?.get?.("Contents");
      const pageContentText = contentText(contents);
      const vectors = vectorOperations(pageContentText);
      counts.vectors += vectors.length;
      vectors.forEach((operation, vectorIndex) => addFingerprint(objects, "vectors", `page:${pageNumber}:vector:${vectorIndex + 1}`, operation, pageNumber, operation.slice(0, 80)));

      let annotationIndex = 0;
      let formIndex = 0;
      let signatureIndex = 0;
      for (const annotation of page.getAnnotations?.() ?? []) {
        annotationIndex += 1;
        counts.annotations += 1;
        const type = String(annotation.getType?.() ?? "");
        const semantic = JSON.stringify({
          type,
          rect: roundRect(safe(() => annotation.getBounds?.(), [])),
          contents: safe(() => String(annotation.getContents?.() ?? ""), ""),
          author: safe(() => String(annotation.getAuthor?.() ?? ""), ""),
          fieldName: safe(() => String(annotation.getFieldName?.() ?? ""), ""),
          fieldType: safe(() => String(annotation.getFieldType?.() ?? ""), ""),
          fieldValue: safe(() => String(annotation.getFieldValue?.() ?? ""), ""),
          signatureValue: hashText(stringValue(annotation.getObject?.()?.get?.("V")))
        });
        addFingerprint(objects, "annotations", `page:${pageNumber}:annotation:${annotationIndex}`, semantic, pageNumber, type || "Annotation");
        if (type === "Widget") {
          formIndex += 1;
          counts.forms += 1;
          addFingerprint(objects, "forms", `page:${pageNumber}:form:${formIndex}`, semantic, pageNumber, safe(() => String(annotation.getFieldName?.() ?? "Field"), "Field"));
          if (String(annotation.getFieldType?.() ?? "") === "Signature") {
            signatureIndex += 1;
            counts.signatures += 1;
            addFingerprint(objects, "signatures", `page:${pageNumber}:signature:${signatureIndex}`, semantic, pageNumber, "Signature field");
          }
        }
        annotation.destroy?.();
      }

      const links = page.getLinks?.() ?? [];
      counts.links += links.length;
      links.forEach((link: any, linkIndex: number) => {
        const semantic = JSON.stringify({ uri: safe(() => String(link.getURI?.() ?? link.uri ?? ""), ""), bounds: roundRect(safe(() => link.getBounds?.(), [])) });
        addFingerprint(objects, "links", `page:${pageNumber}:link:${linkIndex + 1}`, semantic, pageNumber, semantic.slice(0, 80));
        link.destroy?.();
      });
    } finally { page.destroy(); }
  }

  for (const [semantic, id] of fontBySemantic) addFingerprint(objects, "fonts", id, semantic, undefined, semantic.slice(0, 80));
  counts.fonts = fontBySemantic.size;

  const outline = flattenOutline(safe(() => pdf.loadOutline() ?? [], []));
  counts.bookmarks = outline.length;
  outline.forEach((item) => addFingerprint(objects, "bookmarks", `bookmark:${item.id}`, item.semantic, undefined, item.semantic.slice(0, 80)));

  counts.layers = Number(safe(() => pdf.countLayers(), 0));
  for (let index = 0; index < counts.layers; index += 1) {
    const name = safe(() => String(pdf.getLayerName?.(index) ?? `Layer ${index + 1}`), `Layer ${index + 1}`);
    const visible = Boolean(safe(() => pdf.isLayerVisible?.(index), true));
    addFingerprint(objects, "layers", `layer:${index + 1}`, `${name}|visible:${visible}`, undefined, name);
  }

  const embeddedFiles = safe(() => pdf.getEmbeddedFiles?.() ?? {}, {} as Record<string, unknown>);
  const attachmentNames = safe(() => pdf.getEmbeddedFileNames?.() ?? Object.keys(embeddedFiles), Object.keys(embeddedFiles));
  counts.attachments = Math.max(Number(safe(() => pdf.countEmbeddedFiles?.(), 0)), attachmentNames.length);
  for (let index = 0; index < counts.attachments; index += 1) {
    const name = String(attachmentNames[index] ?? `attachment-${index + 1}`);
    const params = safe(() => pdf.getEmbeddedFileParams?.(name) ?? {}, {});
    const payload = (embeddedFiles as Record<string, any>)[name];
    const digest = payload instanceof Uint8Array ? hashBytes(payload) : payload instanceof ArrayBuffer ? hashBytes(new Uint8Array(payload)) : hashText(stringValue(payload));
    addFingerprint(objects, "attachments", `attachment:${index + 1}`, `${name}|${JSON.stringify(params)}|${digest}`, undefined, name);
  }

  const trailer = pdf.getTrailer?.();
  const root = trailer?.get?.("Root");
  const structureRoot = root?.get?.("StructTreeRoot");
  counts.tags = structureRoot ? 1 : 0;
  if (structureRoot) addFingerprint(objects, "tags", "structure-root", `present|${stringValue(root?.get?.("MarkInfo"))}|${stringValue(structureRoot)}`);

  const info = trailer?.get?.("Info");
  const metadata: Record<string, string> = {};
  info?.forEach?.((value: any, key: string) => { metadata[key] = stringValue(value); });
  counts.metadata = Object.keys(metadata).length;
  Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, value]) => addFingerprint(objects, "metadata", `metadata:${key}`, `${key}=${value}`, undefined, key));
  const xmp = root?.get?.("Metadata");
  if (xmp) {
    counts.metadata += 1;
    addFingerprint(objects, "metadata", "metadata:xmp", `xmp:${streamDigest(xmp)}`, undefined, "XMP metadata");
  }

  if (counts.encryption) addFingerprint(objects, "encryption", "encryption", "encrypted");

  return {
    graphVersion: 2,
    pageCount: counts.pages,
    counts,
    encrypted: Boolean(pdf.needsPassword?.()),
    tagged: Boolean(counts.tags),
    metadata,
    objects,
    fingerprints: aggregateCategoryFingerprints(objects),
    warnings: []
  };
}

function compare(operation: string, source: PreservationGraph, output: PreservationGraph, start: number) {
  return comparePreservationGraphs(operation, preservationPolicy(operation), source, output, performance.now() - start);
}

function appendStream(pdf: any, page: any, content: string): void {
  const pageObj = page.getObject();
  const stream = pdf.addStream(content);
  const existing = pageObj.get("Contents");
  if (!existing) pageObj.put("Contents", stream);
  else if (existing.isArray?.()) existing.push(stream);
  else {
    const array = pdf.newArray();
    array.push(existing);
    array.push(stream);
    pageObj.put("Contents", array);
  }
}

function fontResource(pdf: any, page: any): void {
  const pageObj = page.getObject();
  let resources = pageObj.get("Resources") || pageObj.getInheritable?.("Resources");
  if (resources) resources = pdf.graftObject(resources); else resources = pdf.newDictionary();
  pageObj.put("Resources", resources);
  let fonts = resources.get("Font");
  if (!fonts) { fonts = pdf.newDictionary(); resources.put("Font", fonts); }
  if (!fonts.get("LPSOCR")) fonts.put("LPSOCR", pdf.addSimpleFont(new (mupdf as any).Font("Helvetica"), "Latin"));
}

function escape(text: string): string {
  if ([...text].some((char) => (char.codePointAt(0) ?? 0) > 255)) throw new Error("Original-page OCR currently supports Latin text only.");
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function save(pdf: any): Uint8Array {
  const buffer = pdf.saveToBuffer("garbage=4,clean=yes,compress=yes,compress-images=yes,compress-fonts=yes,appearance=all,encrypt=keep");
  try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
}

function pageSize(settings: ImpositionSettings): [number, number] {
  return settings.pageSize === "letter" ? [612, 792] : [595.276, 841.89];
}

function impose(pdf: any, settings: ImpositionSettings, requestId: string): any {
  const output = new (mupdf as any).PDFDocument();
  const [sheetWidth, sheetHeight] = pageSize(settings);
  const slots = settings.layout === "4-up" ? 4 : 2;
  for (let start = 0; start < pdf.countPages(); start += slots) {
    active(requestId);
    const page = output.addPage([0, 0, sheetWidth, sheetHeight], 0);
    for (let offset = 0; offset < slots && start + offset < pdf.countPages(); offset += 1) {
      const source = pdf.loadPage(start + offset);
      try {
        const box = source.getBounds();
        const columns = settings.layout === "4-up" ? 2 : 1;
        const rows = 2;
        const column = offset % columns;
        const row = Math.floor(offset / columns);
        const slotWidth = (sheetWidth - settings.margin * 2 - settings.gutter * (columns - 1)) / columns;
        const slotHeight = (sheetHeight - settings.margin * 2 - settings.gutter) / rows;
        const scale = Math.min(slotWidth / (box[2] - box[0]), slotHeight / (box[3] - box[1]));
        const width = (box[2] - box[0]) * scale;
        const height = (box[3] - box[1]) * scale;
        const x = settings.margin + column * (slotWidth + settings.gutter) + (slotWidth - width) / 2;
        const y = settings.margin + (rows - 1 - row) * (slotHeight + settings.gutter) + (slotHeight - height) / 2;
        const form = output.addPageAsXObject(pdf, start + offset);
        const resources = page.getObject().get("Resources") ?? output.newDictionary();
        page.getObject().put("Resources", resources);
        let xobjects = resources.get("XObject");
        if (!xobjects) { xobjects = output.newDictionary(); resources.put("XObject", xobjects); }
        const name = `Pg${start + offset + 1}`;
        xobjects.put(name, form);
        appendStream(output, page, `q ${scale.toFixed(5)} 0 0 ${scale.toFixed(5)} ${(x - box[0] * scale).toFixed(3)} ${(y - box[1] * scale).toFixed(3)} cm /${name} Do Q\n${settings.borders ? `q .6 w 0 0 0 RG ${x.toFixed(3)} ${y.toFixed(3)} ${width.toFixed(3)} ${height.toFixed(3)} re S Q\n` : ""}`);
      } finally { source.destroy(); }
    }
    page.destroy?.();
  }
  return output;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "CANCEL") { cancelled.add(request.requestId); return; }

  void (async () => {
    const start = performance.now();
    let pdf: any;
    try {
      pdf = new (mupdf as any).PDFDocument(new Uint8Array(request.bytes));
      authenticate(pdf, request.password);
      const source = graph(pdf, request.requestId);
      if (request.type === "INSPECT") {
        self.postMessage({ type: "PRESERVATION_INSPECTION", requestId: request.requestId, graph: source });
        return;
      }

      let outputPdf = pdf;
      let operation = "";
      if (request.type === "OCR_OVERLAY") {
        operation = "ocr-overlay";
        for (const overlay of request.pages ?? []) {
          active(request.requestId);
          const page = pdf.loadPage(overlay.pageNumber - 1);
          try {
            fontResource(pdf, page);
            const transform = page.getTransform?.() ?? [1, 0, 0, 1, 0, 0];
            let content = "";
            for (const word of overlay.words) {
              if (!word.text.trim()) continue;
              const x = transform[0] * word.x + transform[2] * (word.y + word.h) + transform[4];
              const y = transform[1] * word.x + transform[3] * (word.y + word.h) + transform[5];
              const size = Math.max(4, word.h * .75);
              content += `BT 3 Tr /LPSOCR ${size.toFixed(2)} Tf 1 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} Tm (${escape(word.text)}) Tj ET\n`;
            }
            appendStream(pdf, page, content);
          } finally { page.destroy(); }
        }
      } else if (request.type === "OPTIMIZE") {
        operation = "image-optimize";
        const settings = request.settings as ImageOptimizationSettings;
        if (settings.subsetFonts) safe(() => pdf.subsetFonts(), undefined);
        if (settings.removeMetadata) {
          const trailer = pdf.getTrailer?.();
          trailer?.delete?.("Info");
          trailer?.get?.("Root")?.delete?.("Metadata");
        }
      } else {
        operation = "impose";
        outputPdf = impose(pdf, request.settings as ImpositionSettings, request.requestId);
      }

      const bytes = save(outputPdf);
      const reopened = new (mupdf as any).PDFDocument(bytes);
      try {
        authenticate(reopened, request.password);
        const output = graph(reopened, request.requestId);
        const report = compare(operation, source, output, start);
        if (!report.passed) throw new Error(`Preservation validation failed: ${report.failures.join(" ")}`);
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        self.postMessage({ type: "PRESERVATION_RESULT", requestId: request.requestId, output: buffer, report }, [buffer]);
      } finally {
        reopened.destroy?.();
        if (outputPdf !== pdf) outputPdf.destroy?.();
      }
    } catch (error) {
      self.postMessage({ type: "PRESERVATION_ERROR", requestId: request.requestId, error: { message: error instanceof Error ? error.message : String(error) } });
    } finally {
      pdf?.destroy?.();
      cancelled.delete(request.requestId);
    }
  })();
};
