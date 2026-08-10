import * as mupdf from "mupdf";
import type { AffineMatrix } from "../core/coordinates";
import type { ArchivalFinding, BatesSettings, ImageReplacement, LayerInspection, ProfessionalImageRegion, ProfessionalInspection, ProfessionalRect, ProfessionalTextLine, TextReplacement } from "../types/professional";
import { parsePageSelection } from "../organizer/pageSelection";

type InspectRequest = { type: "INSPECT_PROFESSIONAL"; requestId: string; bytes: ArrayBuffer; password?: string };
type EditRequest = { type: "APPLY_PROFESSIONAL_EDITS"; requestId: string; bytes: ArrayBuffer; password?: string; text: TextReplacement[]; images: Array<Omit<ImageReplacement, "bytes"> & { bytes: ArrayBuffer }> };
type BatesRequest = { type: "APPLY_BATES"; requestId: string; bytes: ArrayBuffer; password?: string; settings: BatesSettings };
type LayerRequest = { type: "APPLY_LAYERS"; requestId: string; bytes: ArrayBuffer; password?: string; layers: LayerInspection[] };
type CancelRequest = { type: "CANCEL"; requestId: string };
type Request = InspectRequest | EditRequest | BatesRequest | LayerRequest | CancelRequest;

const cancelled = new Set<string>();
let resourceSequence = 0;
function active(id: string) { if (cancelled.has(id)) throw new DOMException("Operation cancelled.", "AbortError"); }
function safe<T>(callback: () => T, fallback: T): T { try { return callback(); } catch { return fallback; } }
function authenticate(document: any, password?: string) { if (document.needsPassword() && (!password || document.authenticatePassword(password) === 0)) throw new Error("The PDF password is required or incorrect."); }

function point(matrix: AffineMatrix, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}
function transformRect(matrix: AffineMatrix, value: ProfessionalRect): [number, number, number, number] {
  const points = [point(matrix, value.x, value.y), point(matrix, value.x + value.w, value.y), point(matrix, value.x + value.w, value.y + value.h), point(matrix, value.x, value.y + value.h)];
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}
function pageSpaceRect(value: ProfessionalRect): [number, number, number, number] {
  return [value.x, value.y, value.x + value.w, value.y + value.h];
}
function rgb(hex: string): [number, number, number] {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "000000";
  return [parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255];
}
function escapePdfText(text: string): string {
  if ([...text].some(char => char.charCodeAt(0) > 255)) throw new Error("Static professional text currently supports Latin-1 characters. Use the visual editor for other scripts.");
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\r?\n/g, "\\n");
}
function appendPageStream(pdf: any, page: any, content: string): void {
  const pageObject = page.getObject();
  const stream = pdf.addStream(content);
  const existing = pageObject.get("Contents");
  if (!existing) pageObject.put("Contents", stream);
  else if (existing.isArray?.()) existing.push(stream);
  else { const array = pdf.newArray(); array.push(existing); array.push(stream); pageObject.put("Contents", array); }
}
function resourceDictionary(pdf: any, page: any, category: "Font" | "XObject"): any {
  const pageObject = page.getObject();
  let resources = pageObject.get("Resources");
  if (!resources) {
    const inherited = pageObject.getInheritable?.("Resources");
    resources = inherited ? pdf.graftObject(inherited) : pdf.newDictionary();
    pageObject.put("Resources", resources);
  }
  let dictionary = resources.get(category);
  if (!dictionary) { dictionary = pdf.newDictionary(); resources.put(category, dictionary); }
  return dictionary;
}
function addStaticText(pdf: any, page: any, value: { rect: [number, number, number, number]; text: string; fontFamily: string; fontSize: number; color: string; background?: string; align?: "left" | "center" | "right" }): void {
  const fonts = resourceDictionary(pdf, page, "Font");
  const resourceName = `LPSF${++resourceSequence}`;
  if (!fonts.get(resourceName)) {
    const family = value.fontFamily === "Times-Roman" ? "Times-Roman" : value.fontFamily === "Courier" ? "Courier" : "Helvetica";
    fonts.put(resourceName, pdf.addSimpleFont(new (mupdf as any).Font(family), "Latin"));
  }
  const [x0, y0, x1, y1] = value.rect;
  const width = Math.max(1, x1 - x0), height = Math.max(1, y1 - y0);
  const [r, g, b] = rgb(value.color);
  const [br, bg, bb] = rgb(value.background ?? "#ffffff");
  const estimatedWidth = value.text.length * value.fontSize * 0.52;
  const x = value.align === "center" ? x0 + Math.max(0, (width - estimatedWidth) / 2) : value.align === "right" ? Math.max(x0, x1 - estimatedWidth) : x0 + 1.5;
  const y = y0 + Math.max(value.fontSize, (height + value.fontSize * 0.72) / 2);
  appendPageStream(pdf, page, `q ${br.toFixed(4)} ${bg.toFixed(4)} ${bb.toFixed(4)} rg ${x0.toFixed(3)} ${y0.toFixed(3)} ${width.toFixed(3)} ${height.toFixed(3)} re f Q\nBT /${resourceName} ${value.fontSize.toFixed(2)} Tf ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)} rg 1 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} Tm (${escapePdfText(value.text)}) Tj ET\n`);
}
function addStaticImage(pdf: any, page: any, rect: [number, number, number, number], bytes: Uint8Array): void {
  const image = new (mupdf as any).Image(bytes);
  try {
    const images = resourceDictionary(pdf, page, "XObject");
    const resourceName = `LPSI${++resourceSequence}`;
    if (!images.get(resourceName)) images.put(resourceName, pdf.addImage(image));
    const [x0, y0, x1, y1] = rect, width = Math.max(1, x1 - x0), height = Math.max(1, y1 - y0);
    appendPageStream(pdf, page, `q ${width.toFixed(3)} 0 0 ${height.toFixed(3)} ${x0.toFixed(3)} ${y0.toFixed(3)} cm /${resourceName} Do Q\n`);
  } finally { image.destroy?.(); }
}
function save(pdf: any): Uint8Array {
  const buffer = pdf.saveToBuffer("garbage=4,clean=yes,compress=yes,compress-images=yes,compress-fonts=yes,appearance=all,encrypt=keep");
  try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
}
function objectPath(root: any, ...path: string[]): any { let current = root; for (const key of path) { current = current?.get?.(key); if (!current) return null; } return current; }
function primitiveString(object: any): string { return safe(() => object?.asString?.() ?? object?.asName?.() ?? String(object?.valueOf?.() ?? ""), ""); }

function inspectFonts(pdf: any): { total: number; embedded: number; names: string[] } {
  const names = new Set<string>(); let total = 0, embedded = 0;
  for (let index = 0; index < pdf.countPages(); index += 1) {
    const page = pdf.loadPage(index);
    try {
      const resources = page.getObject().getInheritable?.("Resources");
      const fonts = resources?.get?.("Font");
      fonts?.forEach?.((fontRef: any) => {
        const font = fontRef.resolve?.() ?? fontRef; const name = primitiveString(font.get?.("BaseFont")) || "Unnamed";
        if (names.has(`${name}:${safe(() => fontRef.asIndirect?.(), name)}`)) return;
        names.add(`${name}:${safe(() => fontRef.asIndirect?.(), name)}`); total += 1;
        const descriptor = font.get?.("FontDescriptor")?.resolve?.() ?? font.get?.("FontDescriptor");
        if (descriptor && (descriptor.get?.("FontFile") || descriptor.get?.("FontFile2") || descriptor.get?.("FontFile3"))) embedded += 1;
      });
    } finally { page.destroy(); }
  }
  return { total, embedded, names: [...names].map(value => value.split(":")[0]) };
}

function inspect(pdf: any, encrypted: boolean, requestId: string): ProfessionalInspection {
  const trailer = pdf.getTrailer?.(), root = trailer?.get?.("Root");
  const textLines: ProfessionalTextLine[] = [], imageRegions: ProfessionalImageRegion[] = [];
  for (let pageIndex = 0; pageIndex < pdf.countPages(); pageIndex += 1) {
    active(requestId);
    const page = pdf.loadPage(pageIndex);
    try {
      const structured = page.toStructuredText("preserve-spans");
      try {
        const data = JSON.parse(structured.asJSON(1));
        (data.blocks ?? []).forEach((block: any, blockIndex: number) => {
          if (block.type === "image" && block.bbox) imageRegions.push({ id: `${pageIndex + 1}-image-${blockIndex}`, pageNumber: pageIndex + 1, bounds: block.bbox });
          if (block.type !== "text") return;
          (block.lines ?? []).forEach((line: any, lineIndex: number) => {
            const text = String(line.text ?? "").trim(); if (!text || !line.bbox) return;
            const latin = [...text].every(character => character.charCodeAt(0) <= 255);
            textLines.push({ id: `${pageIndex + 1}-${blockIndex}-${lineIndex}`, pageNumber: pageIndex + 1, text, bounds: line.bbox, fontName: String(line.font?.name ?? "Unknown"), fontFamily: ["serif","sans-serif","monospace"].includes(line.font?.family) ? line.font.family : "sans-serif", fontSize: Number(line.font?.size ?? Math.max(8, line.bbox.h * 0.8)), fontWeight: line.font?.weight === "bold" ? "bold" : "normal", fontStyle: line.font?.style === "italic" ? "italic" : "normal", classification: latin ? "redact-and-replace" : "overlay-only", reason: latin ? "The line can be safely removed by redaction and replaced as static Latin text." : "The original can be redacted, but static replacement for this script requires a user-supplied embedded font and remains deferred." });
          });
        });
      } finally { structured.destroy?.(); }
    } finally { page.destroy(); }
  }
  const layers: LayerInspection[] = [];
  const layerCount = Number(safe(() => pdf.countLayers(), 0));
  for (let index = 0; index < layerCount; index += 1) layers.push({ index, name: safe(() => pdf.getLayerName(index), `Layer ${index + 1}`), visible: Boolean(safe(() => pdf.isLayerVisible(index), true)) });
  const embeddedFiles = safe(() => pdf.getEmbeddedFiles(), {} as Record<string, unknown>);
  const attachmentCount = Object.keys(embeddedFiles ?? {}).length;
  const hasJavaScript = Boolean(objectPath(root, "Names", "JavaScript") || objectPath(root, "JavaScript") || objectPath(root, "OpenAction") || objectPath(root, "AA"));
  const language = primitiveString(root?.get?.("Lang"));
  const tagged = Boolean(root?.get?.("StructTreeRoot") || safe(() => root?.get?.("MarkInfo")?.get?.("Marked")?.asBoolean?.(), false));
  const title = safe(() => pdf.getMetaData("info:Title"), "");
  const version = safe(() => pdf.getVersion(), 17);
  const fonts = inspectFonts(pdf);
  const outputIntentCount = Number(root?.get?.("OutputIntents")?.length ?? 0);
  const findings: ArchivalFinding[] = [
    { id: "encryption", severity: encrypted ? "fail" : "pass", title: "Encryption", detail: encrypted ? "Encrypted PDFs cannot conform to common PDF/A archival profiles." : "No encryption is required to open the document." },
    { id: "active-content", severity: hasJavaScript ? "fail" : "pass", title: "Active content", detail: hasJavaScript ? "JavaScript or automatic actions were detected." : "No catalog JavaScript or automatic action was detected." },
    { id: "attachments", severity: attachmentCount ? "warning" : "pass", title: "Embedded files", detail: attachmentCount ? `${attachmentCount} embedded file(s) require profile-specific review.` : "No embedded files were detected." },
    { id: "fonts", severity: fonts.total === 0 ? "info" : fonts.embedded === fonts.total ? "pass" : "fail", title: "Font embedding", detail: fonts.total === 0 ? "No page font resources were detected." : `${fonts.embedded} of ${fonts.total} detected font resources are embedded.` },
    { id: "tagging", severity: tagged ? "pass" : "warning", title: "Tagged structure", detail: tagged ? "A structure tree or marked-content declaration is present." : "No tagged structure was detected." },
    { id: "language", severity: language ? "pass" : "warning", title: "Document language", detail: language || "No catalog language is declared." },
    { id: "title", severity: title ? "pass" : "warning", title: "Document title", detail: title || "No title metadata is set." },
    { id: "output-intent", severity: outputIntentCount ? "pass" : "warning", title: "Output intent", detail: outputIntentCount ? `${outputIntentCount} output intent(s) detected.` : "No output intent or archival color profile was detected." },
    { id: "claim", severity: "info", title: "Conformance scope", detail: "This is a readiness analysis, not a certified PDF/A validation result." }
  ];
  return { pageCount: pdf.countPages(), pdfVersion: `PDF ${Math.floor(version / 10)}.${version % 10}`, language, tagged, titlePresent: Boolean(title), encrypted, hasJavaScript, attachmentCount, layerCount, layers, textLines, imageRegions, findings };
}

function parsePageRange(expression: string, count: number): number[] {
  const parsed = parsePageSelection(expression.trim() || "all", count);
  if (parsed.errors.length) throw new Error(parsed.errors.join(" "));
  const pages = [...parsed.pages].sort((left, right) => left - right);
  if (!pages.length) throw new Error("The Bates page range did not select any pages.");
  return pages;
}

function processEdits(pdf: any, request: EditRequest): { changedPages: number[]; warnings: string[] } {
  const warnings: string[] = [], changed = new Set<number>();
  const byPageText = new Map<number, TextReplacement[]>(), byPageImages = new Map<number, EditRequest["images"]>();
  request.text.forEach(item => byPageText.set(item.pageNumber, [...(byPageText.get(item.pageNumber) ?? []), item]));
  request.images.forEach(item => byPageImages.set(item.pageNumber, [...(byPageImages.get(item.pageNumber) ?? []), item]));
  const pages = new Set([...byPageText.keys(), ...byPageImages.keys()]);
  for (const pageNumber of pages) {
    active(request.requestId); if (pageNumber < 1 || pageNumber > pdf.countPages()) { warnings.push(`Page ${pageNumber} no longer exists and was skipped.`); continue; }
    const page = pdf.loadPage(pageNumber - 1);
    try {
      const transform = page.getTransform() as AffineMatrix;
      const textItems = byPageText.get(pageNumber) ?? [], imageItems = byPageImages.get(pageNumber) ?? [];
      for (const item of textItems.filter(value => value.mode === "redact-replace")) { const annotation = page.createAnnotation("Redaction"); annotation.setRect(pageSpaceRect(item.bounds)); annotation.update?.(); }
      for (const item of imageItems.filter(value => value.removeUnderlying)) { const annotation = page.createAnnotation("Redaction"); annotation.setRect(pageSpaceRect(item.bounds)); annotation.update?.(); }
      if (textItems.some(value => value.mode === "redact-replace") || imageItems.some(value => value.removeUnderlying)) page.applyRedactions(false, (mupdf as any).PDFPage.REDACT_IMAGE_PIXELS, (mupdf as any).PDFPage.REDACT_LINE_ART_REMOVE_IF_TOUCHED, (mupdf as any).PDFPage.REDACT_TEXT_REMOVE);
      for (const item of textItems) addStaticText(pdf, page, { rect: transformRect(transform, item.bounds), text: item.replacementText, fontFamily: item.fontFamily, fontSize: item.fontSize, color: item.color, background: item.backgroundColor });
      for (const item of imageItems) addStaticImage(pdf, page, transformRect(transform, item.bounds), new Uint8Array(item.bytes));
      changed.add(pageNumber);
    } finally { page.destroy(); }
  }
  return { changedPages: [...changed].sort((a,b)=>a-b), warnings };
}

function processBates(pdf: any, settings: BatesSettings): { changedPages: number[]; warnings: string[] } {
  const pages = parsePageRange(settings.pageRange, pdf.countPages()), warnings: string[] = [];
  pages.forEach((pageNumber, index) => {
    const page = pdf.loadPage(pageNumber - 1);
    try {
      const bounds = page.getBounds(); const width = bounds[2] - bounds[0], height = bounds[3] - bounds[1];
      const boxWidth = Math.min(width * 0.42, Math.max(110, settings.fontSize * 18)), boxHeight = settings.fontSize * 1.9, margin = 18;
      const left = settings.position.endsWith("left") ? margin : settings.position.endsWith("right") ? width - boxWidth - margin : (width - boxWidth) / 2;
      const top = settings.position.startsWith("top") ? margin : height - boxHeight - margin;
      const transform = page.getTransform() as AffineMatrix;
      const sequence = String(settings.start + index).padStart(settings.digits, "0");
      const label = `${settings.prefix}${sequence}${settings.suffix}${settings.includeFilename ? ` · ${settings.filename}` : ""}`;
      addStaticText(pdf, page, { rect: transformRect(transform, { x: left, y: top, w: boxWidth, h: boxHeight }), text: label, fontFamily: "Courier", fontSize: settings.fontSize, color: settings.color, background: "#ffffff", align: settings.position.endsWith("left") ? "left" : settings.position.endsWith("right") ? "right" : "center" });
    } finally { page.destroy(); }
  });
  if (settings.setPageLabels) {
    if (pages.length === pdf.countPages() && pages.every((page, index) => page === index + 1)) pdf.setPageLabels(0, "D", settings.prefix, settings.start);
    else warnings.push("Internal page labels were not changed because page-label numbering currently requires all pages in natural order.");
  }
  return { changedPages: pages, warnings };
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "CANCEL") { cancelled.add(request.requestId); return; }
  const startedAt = performance.now();
  try {
    const document = (mupdf as any).Document.openDocument(request.bytes, "application/pdf");
    try {
      authenticate(document, request.password); const pdf = document.asPDF(); if (!pdf) throw new Error("The input is not a mutable PDF."); pdf.disableJS?.();
      if (request.type !== "INSPECT_PROFESSIONAL") pdf.check?.();
      if (request.type === "INSPECT_PROFESSIONAL") { const inspection = inspect(pdf, document.needsPassword(), request.requestId); self.postMessage({ type: "PROFESSIONAL_INSPECTION_RESULT", requestId: request.requestId, inspection }); return; }
      let changedPages: number[] = [], warnings: string[] = [], operation = "professional";
      if (request.type === "APPLY_PROFESSIONAL_EDITS") { ({ changedPages, warnings } = processEdits(pdf, request)); operation = "content-replacement"; }
      else if (request.type === "APPLY_BATES") { ({ changedPages, warnings } = processBates(pdf, request.settings)); operation = "bates-numbering"; }
      else if (request.type === "APPLY_LAYERS") { for (const layer of request.layers) { if (layer.index >= 0 && layer.index < pdf.countLayers()) pdf.setLayerVisible(layer.index, layer.visible); } operation = "layer-visibility"; changedPages = Array.from({ length: pdf.countPages() }, (_, i) => i + 1); warnings.push("Layer visibility was saved as optional-content state; the layers remain interactive and were not flattened."); }
      active(request.requestId); const outputBytes = save(pdf), output = outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength);
      self.postMessage({ type: "PROFESSIONAL_EXPORT_RESULT", requestId: request.requestId, output, report: { operation, pageCount: pdf.countPages(), outputBytes: outputBytes.byteLength, changedPages, warnings, durationMs: performance.now() - startedAt } }, [output]);
    } finally { document.destroy(); }
  } catch (error) { self.postMessage({ type: "PROFESSIONAL_ERROR", requestId: request.requestId, error: { name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) } }); }
  finally { cancelled.delete(request.requestId); }
};
export {};
