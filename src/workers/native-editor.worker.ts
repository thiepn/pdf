import * as mupdf from "mupdf";
import {
  classifyTextEditability,
  detectTables,
  estimatedTextWidth,
  formCapability,
  imageCapability,
  rectFromArray,
  vectorCapability
} from "../native/nativeModel";
import type {
  NativeEdit,
  NativeExportReport,
  NativeFontSummary,
  NativeFormFieldType,
  NativeFormObject,
  NativeImageObject,
  NativeInspection,
  NativePageTree,
  NativePathCommand,
  NativeRect,
  NativeTextObject,
  NativeVectorObject
} from "../types/nativeEditor";

type Request =
  | { type: "INSPECT_NATIVE" | "APPLY_NATIVE"; requestId: string; bytes: ArrayBuffer; password?: string; edits?: NativeEdit[] }
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

function pageRect(rect: NativeRect): [number, number, number, number] {
  return [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h];
}

function point(matrix: number[], x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

function inverseMatrix(matrix: number[]): number[] {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return [1, 0, 0, 1, 0, 0];
  return [d / determinant, -b / determinant, -c / determinant, a / determinant, (c * f - d * e) / determinant, (b * e - a * f) / determinant];
}

function fitzRectFromPdf(page: PdfPage, rect: NativeRect): NativeRect {
  const inverse = inverseMatrix(page.getTransform?.() ?? [1, 0, 0, 1, 0, 0]);
  const corners = [
    point(inverse, rect.x, rect.y),
    point(inverse, rect.x + rect.w, rect.y),
    point(inverse, rect.x + rect.w, rect.y + rect.h),
    point(inverse, rect.x, rect.y + rect.h)
  ];
  const x = Math.min(...corners.map((corner) => corner[0]));
  const y = Math.min(...corners.map((corner) => corner[1]));
  const x1 = Math.max(...corners.map((corner) => corner[0]));
  const y1 = Math.max(...corners.map((corner) => corner[1]));
  return { x, y, w: x1 - x, h: y1 - y };
}

function fitzCommandFromPdf(page: PdfPage, command: NativePathCommand): NativePathCommand {
  const inverse = inverseMatrix(page.getTransform?.() ?? [1, 0, 0, 1, 0, 0]);
  if (command.op === "Z") return command;
  if (command.op === "C") {
    const p1 = point(inverse, command.x1, command.y1);
    const p2 = point(inverse, command.x2, command.y2);
    const p3 = point(inverse, command.x3, command.y3);
    return { op: "C", x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], x3: p3[0], y3: p3[1] };
  }
  const p = point(inverse, command.x, command.y);
  return { op: command.op, x: p[0], y: p[1] };
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
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1]))
  ];
}

function rgb(hex?: string): [number, number, number] {
  const value = /^#[0-9a-f]{6}$/i.test(hex ?? "") ? (hex ?? "").slice(1) : "000000";
  return [parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255];
}

const winAnsiExtras = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
  [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91],
  [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98],
  [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]
]);

function winAnsiHex(text: string): string {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0xff) bytes.push(code);
    else if (winAnsiExtras.has(code)) bytes.push(winAnsiExtras.get(code) as number);
    else throw new Error(`Character ${char} cannot be encoded by the selected built-in Latin font.`);
  }
  return `<${bytes.map((value) => value.toString(16).padStart(2, "0")).join("")}>`;
}

function utf16Hex(text: string): string {
  let hex = "feff";
  for (let i = 0; i < text.length; i += 1) hex += text.charCodeAt(i).toString(16).padStart(4, "0");
  return `<${hex}>`;
}

function append(pdf: PdfDocument, page: PdfPage, content: string): void {
  const object = page.getObject();
  const stream = pdf.addStream(content);
  const current = object.get("Contents");
  if (!current) object.put("Contents", stream);
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
  let root = object.get("Resources") || object.getInheritable?.("Resources");
  root = root ? pdf.graftObject(root) : pdf.newDictionary();
  object.put("Resources", root);
  let dictionary = root.get(category);
  if (!dictionary) {
    dictionary = pdf.newDictionary();
    root.put(category, dictionary);
  }
  return dictionary;
}

function fontVariant(edit: any): string {
  const family = edit.fontFamily === "Times-Roman" ? "Times" : edit.fontFamily === "Courier" ? "Courier" : "Helvetica";
  const bold = edit.fontWeight === "bold";
  const italic = edit.fontStyle === "italic";
  if (family === "Times") return bold && italic ? "Times-BoldItalic" : bold ? "Times-Bold" : italic ? "Times-Italic" : "Times-Roman";
  if (family === "Courier") return bold && italic ? "Courier-BoldOblique" : bold ? "Courier-Bold" : italic ? "Courier-Oblique" : "Courier";
  return bold && italic ? "Helvetica-BoldOblique" : bold ? "Helvetica-Bold" : italic ? "Helvetica-Oblique" : "Helvetica";
}

interface AddedFont {
  resource: string;
  encode: (text: string) => string;
  font: any;
  wmode: 0 | 1;
}

function addFontResource(pdf: PdfDocument, page: PdfPage, edit: any): AddedFont {
  const fonts = resources(pdf, page, "Font");
  const resource = `LPSN${++sequence}`;
  const language = edit.fontLanguage ?? (["ko", "ja", "zh-Hans", "zh-Hant"].includes(edit.fontFamily) ? edit.fontFamily : undefined);
  const wmode = Number(edit.writingMode ?? 0) === 1 ? 1 : 0;
  if (language) {
    const font = edit.fontBytes?.byteLength
      ? new (mupdf as any).Font(edit.fontName || language, new Uint8Array(edit.fontBytes))
      : new (mupdf as any).Font(language);
    fonts.put(resource, pdf.addCJKFont(font, language, wmode, "sans-serif"));
    return { resource, encode: utf16Hex, font, wmode };
  }
  const font = new (mupdf as any).Font(fontVariant(edit));
  fonts.put(resource, pdf.addSimpleFont(font, "Latin"));
  return { resource, encode: winAnsiHex, font, wmode };
}

function measuredTextWidth(font: AddedFont, text: string, size: number): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const glyph = safe(() => Number(font.font.encodeCharacter(code)), 0);
    const advance = glyph > 0 ? safe(() => Number(font.font.advanceGlyph(glyph, font.wmode)), Number.NaN) : Number.NaN;
    width += Number.isFinite(advance) && advance >= 0 ? advance * size : estimatedTextWidth(char, size);
  }
  return width;
}

function splitMeasuredToken(token: string, width: number, measure: (text: string) => number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const char of [...token]) {
    const next = current + char;
    if (current && measure(next) > width) {
      pieces.push(current);
      current = char;
    } else current = next;
  }
  if (current || !pieces.length) pieces.push(current);
  return pieces;
}

function wrapMeasuredLine(text: string, width: number, measure: (text: string) => number): string[] {
  const normalized = text.trim();
  if (!normalized) return [""];
  if (!/\s/u.test(normalized)) return splitMeasuredToken(normalized, width, measure);
  const words = normalized.split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (measure(word) > width) {
      if (current) { lines.push(current); current = ""; }
      const pieces = splitMeasuredToken(word, width, measure);
      lines.push(...pieces.slice(0, -1));
      current = pieces.at(-1) ?? "";
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > width) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}

function wrapMeasuredText(text: string, width: number, measure: (text: string) => number): string[] {
  const safeWidth = Math.max(1, width - 3);
  const logicalLines = text.replace(/\r\n?/g, "\n").split("\n");
  const lines = logicalLines.flatMap((line) => wrapMeasuredLine(line, safeWidth, measure));
  return lines.length ? lines : [""];
}

function addText(pdf: PdfDocument, page: PdfPage, edit: any): void {
  if (edit.fontSource === "annotation-fallback") {
    const annotation = page.createAnnotation("FreeText");
    annotation.setRect(pageRect(edit.bounds));
    annotation.setContents(edit.text);
    annotation.setColor(rgb(edit.color));
    annotation.setDefaultAppearance?.("Helv", edit.fontSize, rgb(edit.color));
    annotation.update?.();
    return;
  }
  const font = addFontResource(pdf, page, edit);
  const [x0, y0, x1, y1] = pdfRect(page, edit.bounds);
  const width = x1 - x0;
  const height = y1 - y0;
  const [r, g, b] = rgb(edit.color);
  const measure = (value: string) => measuredTextWidth(font, value, edit.fontSize);
  const lines = edit.wrap ? wrapMeasuredText(edit.text, width, measure) : edit.text.replace(/\r\n?/g, "\n").split("\n");
  const lineHeight = edit.fontSize * 1.2;
  const maxLines = Math.max(1, Math.floor(height / lineHeight));
  if (lines.length > maxLines) throw new Error(`Replacement text does not fit the detected box at ${edit.fontSize} pt (${lines.length} lines required, ${maxLines} available). Lower the font size or shorten the text.`);
  if (!edit.wrap && lines.some((line: string) => measure(line) > Math.max(1, width - 3))) throw new Error(`Replacement text is wider than the detected box at ${edit.fontSize} pt. Enable paragraph reflow, lower the font size, or shorten the text.`);
  let content = "";
  if (edit.backgroundColor && edit.backgroundColor !== "transparent") {
    const [br, bg, bb] = rgb(edit.backgroundColor);
    content += `q ${br} ${bg} ${bb} rg ${x0} ${y0} ${width} ${height} re f Q\n`;
  }
  lines.forEach((line: string, index: number) => {
    const measured = measure(line);
    const x = edit.align === "center" ? x0 + Math.max(0, (width - measured) / 2) : edit.align === "right" ? Math.max(x0, x1 - measured) : x0 + 1.5;
    const y = y1 - edit.fontSize - index * lineHeight;
    content += `BT /${font.resource} ${edit.fontSize} Tf ${r} ${g} ${b} rg 1 0 0 1 ${x} ${y} Tm ${font.encode(line)} Tj ET\n`;
  });
  append(pdf, page, content);
}

function addImage(pdf: PdfDocument, page: PdfPage, edit: any): void {
  const image = new (mupdf as any).Image(new Uint8Array(edit.bytes));
  try {
    const dictionary = resources(pdf, page, "XObject");
    const resource = `LPSIMG${++sequence}`;
    dictionary.put(resource, pdf.addImage(image));
    const [x0, y0, x1, y1] = pdfRect(page, edit.bounds);
    const boxWidth = x1 - x0;
    const boxHeight = y1 - y0;
    const imageWidth = Math.max(1, safe(() => Number(image.getWidth()), 1));
    const imageHeight = Math.max(1, safe(() => Number(image.getHeight()), 1));
    let width = boxWidth;
    let height = boxHeight;
    let x = x0;
    let y = y0;
    let clip = false;
    if (edit.fit !== "stretch") {
      const ratio = edit.fit === "cover" ? Math.max(boxWidth / imageWidth, boxHeight / imageHeight) : Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
      width = imageWidth * ratio;
      height = imageHeight * ratio;
      x = x0 + (boxWidth - width) / 2;
      y = y0 + (boxHeight - height) / 2;
      clip = edit.fit === "cover";
    }
    append(pdf, page, `q${clip ? ` ${x0} ${y0} ${boxWidth} ${boxHeight} re W n` : ""} ${width} 0 0 ${height} ${x} ${y} cm /${resource} Do Q\n`);
  } finally { image.destroy?.(); }
}

function graphicsState(pdf: PdfDocument, page: PdfPage, alpha: number): string | undefined {
  if (!Number.isFinite(alpha) || alpha >= 0.999) return undefined;
  const states = resources(pdf, page, "ExtGState");
  const name = `LPSGS${++sequence}`;
  const dictionary = pdf.newDictionary();
  dictionary.put("ca", pdf.newReal(Math.max(0, Math.min(1, alpha))));
  dictionary.put("CA", pdf.newReal(Math.max(0, Math.min(1, alpha))));
  states.put(name, pdf.addObject(dictionary));
  return name;
}

function vectorContent(pdf: PdfDocument, page: PdfPage, edit: any): string {
  if (edit.action === "delete") return "";
  const matrix = page.getTransform?.() ?? [1, 0, 0, 1, 0, 0];
  const [fr, fg, fb] = rgb(edit.fillColor);
  const [sr, sg, sb] = rgb(edit.strokeColor);
  const gs = graphicsState(pdf, page, edit.alpha ?? 1);
  let content = `q${gs ? ` /${gs} gs` : ""} ${fr} ${fg} ${fb} rg ${sr} ${sg} ${sb} RG ${edit.lineWidth || 1} w\n`;
  for (const command of edit.commands as NativePathCommand[]) {
    if (command.op === "Z") { content += "h\n"; continue; }
    if (command.op === "C") {
      const p1 = point(matrix, command.x1 * edit.scaleX + edit.dx, command.y1 * edit.scaleY + edit.dy);
      const p2 = point(matrix, command.x2 * edit.scaleX + edit.dx, command.y2 * edit.scaleY + edit.dy);
      const p3 = point(matrix, command.x3 * edit.scaleX + edit.dx, command.y3 * edit.scaleY + edit.dy);
      content += `${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]} c\n`;
      continue;
    }
    const p = point(matrix, command.x * edit.scaleX + edit.dx, command.y * edit.scaleY + edit.dy);
    content += `${p[0]} ${p[1]} ${command.op.toLowerCase()}\n`;
  }
  return content + (edit.fillColor && edit.strokeColor ? "B\n" : edit.fillColor ? "f\n" : "S\n") + "Q\n";
}

function widgetType(widget: any): NativeFormFieldType {
  const value = String(safe(() => widget.getFieldType(), "unknown"));
  return (["button", "checkbox", "combobox", "listbox", "radiobutton", "signature", "text"] as string[]).includes(value) ? value as NativeFormFieldType : "unknown";
}

function inspectForm(widget: any, pageNumber: number, widgetIndex: number): NativeFormObject {
  const fieldType = widgetType(widget);
  const name = String(safe(() => widget.getName(), ""));
  const label = String(safe(() => widget.getLabel(), name));
  const readOnly = Boolean(safe(() => widget.isReadOnly(), false));
  const signed = fieldType === "signature" ? Boolean(safe(() => widget.isSigned?.(), false) || safe(() => widget.getObject?.()?.get?.("V"), null)) : null;
  const capability = formCapability(fieldType, readOnly, signed);
  return {
    id: `p${pageNumber}:form:${widgetIndex}:${name || fieldType}`,
    type: "form",
    pageNumber,
    bounds: rectFromArray(safe(() => widget.getRect(), [0, 0, 0, 0])),
    widgetIndex,
    fieldType,
    name,
    label,
    value: Boolean(safe(() => widget.isPassword(), false)) ? "" : String(safe(() => widget.getValue(), "")),
    options: safe(() => widget.getOptions(), [] as string[]).map(String),
    readOnly,
    multiline: Boolean(safe(() => widget.isMultiline(), false)),
    password: Boolean(safe(() => widget.isPassword(), false)),
    signed,
    editability: fieldType === "signature" || signed ? "signature-protected" : readOnly ? "read-only" : capability.level === "native-safe" ? "field-value" : "unsupported",
    capability
  };
}

function inspect(pdf: PdfDocument, requestId: string): NativeInspection {
  const pages: NativePageTree[] = [];
  const fonts = new Map<string, NativeFontSummary>();
  const warnings: string[] = [];
  let text = 0;
  let images = 0;
  let vectors = 0;
  let tables = 0;
  let forms = 0;
  for (let index = 0; index < pdf.countPages(); index += 1) {
    active(requestId);
    const page = pdf.loadPage(index);
    try {
      const bounds = page.getBounds();
      const objects: any[] = [];
      const lines: any[] = [];
      const structuredText = page.toStructuredText("preserve-images,preserve-spans");
      try {
        const data = JSON.parse(structuredText.asJSON(1));
        for (const [blockIndex, block] of (data.blocks ?? []).entries()) {
          if (block.type === "image" && block.bbox) {
            const item: NativeImageObject = { id: `p${index + 1}:image:${blockIndex}`, type: "image", pageNumber: index + 1, bounds: rectFromArray(block.bbox), width: block.width, height: block.height, editability: "replace-region", capability: imageCapability() };
            objects.push(item);
            images += 1;
            continue;
          }
          if (block.type !== "text") continue;
          for (const [lineIndex, line] of (block.lines ?? []).entries()) {
            const value = String(line.text ?? "").trim();
            if (!value || !line.bbox) continue;
            const box = rectFromArray(line.bbox);
            const fontName = String(line.font?.name ?? "Unknown");
            const classification = classifyTextEditability(value, fontName);
            const item: NativeTextObject = {
              id: `p${index + 1}:text:${blockIndex}:${lineIndex}`,
              type: "text",
              pageNumber: index + 1,
              bounds: box,
              text: value,
              fontName,
              family: ["serif", "sans-serif", "monospace"].includes(line.font?.family) ? line.font.family : "sans-serif",
              size: Number(line.font?.size ?? Math.max(8, box.h * 0.75)),
              weight: line.font?.weight === "bold" ? "bold" : "normal",
              style: line.font?.style === "italic" ? "italic" : "normal",
              writingMode: Number(line.wmode ?? 0) === 1 ? 1 : 0,
              ...classification
            };
            objects.push(item);
            lines.push({ id: item.id, text: value, bounds: box, fontSize: item.size });
            text += 1;
            const summary = fonts.get(fontName) ?? { name: fontName, family: item.family, embedded: false, pages: [], scripts: [] };
            if (!summary.pages.includes(index + 1)) summary.pages.push(index + 1);
            if (!summary.scripts.includes(item.script)) summary.scripts.push(item.script);
            fonts.set(fontName, summary);
          }
        }
      } finally { structuredText.destroy?.(); }

      const content = safe(() => {
        const current = page.getObject().get("Contents");
        return String(current?.readStream?.() ?? "");
      }, "");
      const rectangles = [...content.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+re\b/g)].slice(0, 50);
      rectangles.forEach((match, vectorIndex) => {
        const x = Number(match[1]);
        const y = Number(match[2]);
        const w = Number(match[3]);
        const h = Number(match[4]);
        const pdfCommands: NativePathCommand[] = [{ op: "M", x, y }, { op: "L", x: x + w, y }, { op: "L", x: x + w, y: y + h }, { op: "L", x, y: y + h }, { op: "Z" }];
        const commands = pdfCommands.map((command) => fitzCommandFromPdf(page, command));
        const item: NativeVectorObject = { id: `p${index + 1}:vector:${vectorIndex}`, type: "vector", pageNumber: index + 1, bounds: fitzRectFromPdf(page, { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) }), commands, paint: "stroke", strokeColor: "#333333", lineWidth: 1, alpha: 1, evenOdd: false, editability: "region-rebuild", capability: vectorCapability(commands.length) };
        objects.push(item);
        vectors += 1;
      });

      const foundTables = detectTables(index + 1, lines);
      objects.push(...foundTables);
      tables += foundTables.length;

      const widgets = safe(() => page.getWidgets(), [] as any[]);
      widgets.forEach((widget: any, widgetIndex: number) => objects.push(inspectForm(widget, index + 1, widgetIndex)));
      forms += widgets.length;

      pages.push({ pageNumber: index + 1, originX: bounds[0], originY: bounds[1], width: bounds[2] - bounds[0], height: bounds[3] - bounds[1], objects });
    } finally { page.destroy(); }
  }
  return { pageCount: pdf.countPages(), canEdit: safe(() => pdf.hasPermission?.("edit") !== false, true), pages, fonts: [...fonts.values()], totals: { text, images, vectors, tables, forms }, warnings };
}

function redactRegion(page: PdfPage, bounds: NativeRect): void {
  const redaction = page.createAnnotation("Redaction");
  redaction.setRect(pageRect(bounds));
  redaction.update?.();
  page.applyRedactions(false, (mupdf as any).PDFPage.REDACT_IMAGE_PIXELS, (mupdf as any).PDFPage.REDACT_LINE_ART_REMOVE_IF_TOUCHED, (mupdf as any).PDFPage.REDACT_TEXT_REMOVE);
}

function applyFormEdit(page: PdfPage, edit: any): boolean {
  const widgets = safe(() => page.getWidgets(), [] as any[]);
  const widget = widgets[edit.widgetIndex] ?? widgets.find((candidate: any) => safe(() => candidate.getName(), "") === edit.name);
  if (!widget || safe(() => widget.isReadOnly(), false)) return false;
  const type = widgetType(widget);
  if (type === "text") widget.setTextValue(edit.value);
  else if (type === "combobox" || type === "listbox") widget.setChoiceValue(edit.value);
  else if (type === "checkbox" || type === "radiobutton") {
    if (typeof widget.setChoiceValue === "function") widget.setChoiceValue(edit.value || "Off");
    else {
      const on = !["", "off", "false", "0", "no"].includes(String(edit.value).toLowerCase());
      const current = !["", "off", "false", "0", "no"].includes(String(safe(() => widget.getValue(), "")).toLowerCase());
      if (on !== current) widget.toggle();
    }
  } else return false;
  widget.update?.();
  page.update?.();
  return true;
}

function save(pdf: PdfDocument): Uint8Array {
  const buffer = pdf.saveToBuffer("garbage=4,clean=yes,compress=yes,compress-images=yes,compress-fonts=yes,appearance=all,encrypt=keep");
  try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
}

function comparableText(value: string): { spaced: string; compact: string } {
  const normalized = value.normalize("NFC");
  return { spaced: normalized.replace(/\s+/gu, " ").trim(), compact: normalized.replace(/\s+/gu, "") };
}

function containsReplacement(extracted: string, replacement: string): boolean {
  const source = comparableText(extracted);
  const target = comparableText(replacement);
  if (!target.spaced) return true;
  return source.spaced.includes(target.spaced) || source.compact.includes(target.compact);
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
      if (request.type === "INSPECT_NATIVE") {
        self.postMessage({ type: "NATIVE_INSPECTION", requestId: request.requestId, inspection: inspect(pdf, request.requestId) });
        return;
      }

      const edits = request.edits ?? [];
      const changed = new Set<number>();
      let appliedForms = 0;
      for (const edit of edits) {
        active(request.requestId);
        const page = pdf.loadPage(edit.pageNumber - 1);
        try {
          changed.add(edit.pageNumber);
          if (edit.kind === "text" || edit.kind === "table-cell") {
            if ((edit as any).mode !== "overlay" && edit.originalText !== undefined) redactRegion(page, edit.bounds);
            addText(pdf, page, {
              ...edit,
              fontFamily: (edit as any).fontFamily ?? "Helvetica",
              color: (edit as any).color ?? "#111111",
              backgroundColor: (edit as any).backgroundColor ?? "#ffffff",
              align: (edit as any).align ?? "left",
              wrap: (edit as any).wrap ?? true,
              fontSource: (edit as any).fontSource ?? "built-in"
            });
          } else if (edit.kind === "image") {
            if (edit.removeUnderlying) redactRegion(page, edit.sourceBounds ?? edit.bounds);
            addImage(pdf, page, edit);
          } else if (edit.kind === "vector") {
            redactRegion(page, edit.bounds);
            const content = vectorContent(pdf, page, edit);
            if (content) append(pdf, page, content);
          } else if (edit.kind === "form") {
            if (applyFormEdit(page, edit)) appliedForms += 1;
          }
        } finally { page.destroy(); }
      }

      const output = save(pdf);
      const reopened = new (mupdf as any).PDFDocument(output);
      try {
        auth(reopened, request.password);
        if (reopened.countPages() !== pdf.countPages()) throw new Error("Native edit validation failed: page count changed.");
        for (const edit of edits.filter((item) => item.kind === "text" || item.kind === "table-cell")) {
          const page = reopened.loadPage(edit.pageNumber - 1);
          try {
            const extracted = page.toStructuredText().asText();
            const annotationFallback = edit.kind === "text" && edit.fontSource === "annotation-fallback";
            if (edit.text && !annotationFallback && !containsReplacement(extracted, edit.text)) throw new Error(`Replacement text was not found on page ${edit.pageNumber}.`);
          } finally { page.destroy(); }
        }
        const requestedForms = edits.filter((item) => item.kind === "form");
        if (appliedForms !== requestedForms.length) throw new Error(`Form validation failed: ${requestedForms.length} field edits were requested but ${appliedForms} were applied.`);
        for (const edit of requestedForms) {
          const page = reopened.loadPage(edit.pageNumber - 1);
          try {
            const widgets = safe(() => page.getWidgets(), [] as any[]);
            const widget = widgets[edit.widgetIndex] ?? widgets.find((candidate: any) => safe(() => candidate.getName(), "") === edit.name);
            if (!widget) throw new Error(`Form validation failed: field ${edit.name || edit.widgetIndex} was not found after reopening.`);
            const actual = String(safe(() => widget.getValue(), ""));
            const requested = String(edit.value);
            const booleanField = edit.fieldType === "checkbox" || edit.fieldType === "radiobutton";
            if (!booleanField && actual !== requested) throw new Error(`Form validation failed: field ${edit.name || edit.widgetIndex} reopened with a different value.`);
          } finally { page.destroy(); }
        }
        const warnings: string[] = [];
        if (edits.some((item) => item.kind === "text" && item.fontSource === "annotation-fallback")) warnings.push("Some complex-script replacements were exported as editable visual text layers because safe static shaping is not available.");
        if (edits.some((item) => item.kind === "vector")) warnings.push("Vector edits reconstruct detected path regions; clipping and inherited graphics state may differ from the source object.");
        const report: NativeExportReport = {
          operation: "native-content-edit",
          pageCount: reopened.countPages(),
          outputBytes: output.byteLength,
          changedPages: [...changed].sort((a, b) => a - b),
          textEdits: edits.filter((item) => item.kind === "text").length,
          imageEdits: edits.filter((item) => item.kind === "image").length,
          vectorEdits: edits.filter((item) => item.kind === "vector").length,
          tableCellEdits: edits.filter((item) => item.kind === "table-cell").length,
          formEdits: appliedForms,
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
