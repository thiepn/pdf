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
  NativeTextEditRun,
  NativeTextObject,
  NativeVectorObject
} from "../types/nativeEditor";
import { encodeWinAnsiHex } from "../native/textEncoding";
import { shapeComplexText, type ShapedVisualRun } from "./complexTextShaping";

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

function colorFromStructuredText(value: unknown): string | undefined {
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return `#${(numeric >>> 0 & 0xffffff).toString(16).padStart(6, "0")}`;
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
  // MuPDF's PDFObject.get() returns a PDF null object for missing keys rather
  // than JavaScript null. Test the PDF object type before mutating it. Reuse
  // page-local resources; clone inherited resources only when the page lacks a
  // concrete dictionary so newly-created document-bound objects stay local.
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

function fontVariant(edit: any): string {
  const family = edit.fontFamily === "Times-Roman" ? "Times" : edit.fontFamily === "Courier" ? "Courier" : "Helvetica";
  const bold = edit.fontWeight === "bold";
  const italic = edit.fontStyle === "italic";
  if (family === "Times") return bold && italic ? "Times-BoldItalic" : bold ? "Times-Bold" : italic ? "Times-Italic" : "Times-Roman";
  if (family === "Courier") return bold && italic ? "Courier-BoldOblique" : bold ? "Courier-Oblique" : "Courier";
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
  if (edit.fontSource === "imported-latin" && edit.fontBytes?.byteLength) {
    const font = new (mupdf as any).Font(edit.fontName || "Imported Latin", new Uint8Array(edit.fontBytes));
    fonts.put(resource, pdf.addSimpleFont(font, "Latin"));
    return { resource, encode: encodeWinAnsiHex, font, wmode: 0 };
  }
  const font = new (mupdf as any).Font(fontVariant(edit));
  fonts.put(resource, pdf.addSimpleFont(font, "Latin"));
  return { resource, encode: encodeWinAnsiHex, font, wmode };
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

interface PreparedStyle {
  font: AddedFont;
  fontSize: number;
  color: string;
  source: NativeTextEditRun;
}

interface StyledChar {
  char: string;
  style: PreparedStyle;
  width: number;
}

interface StyledLine {
  chars: StyledChar[];
  width: number;
}

function styleKey(run: NativeTextEditRun, edit: any): string {
  return [run.fontFamily, run.fontSize, run.fontWeight ?? "normal", run.fontStyle ?? "normal", run.fontName ?? "", edit.fontSource, edit.fontLanguage ?? ""].join("|");
}

function prepareStyles(pdf: PdfDocument, page: PdfPage, edit: any): { chars: StyledChar[]; maxSize: number } {
  const sourceRuns: NativeTextEditRun[] = Array.isArray(edit.styleRuns) && edit.styleRuns.length
    ? edit.styleRuns
    : [{ text: edit.text, fontFamily: edit.fontFamily, fontSize: edit.fontSize, color: edit.color, fontWeight: edit.fontWeight, fontStyle: edit.fontStyle, fontName: edit.fontName }];
  const cache = new Map<string, PreparedStyle>();
  const chars: StyledChar[] = [];
  let maxSize = Math.max(1, Number(edit.fontSize) || 1);
  for (const run of sourceRuns) {
    if (!run.text) continue;
    const fontSize = Math.max(1, Number(run.fontSize) || Number(edit.fontSize) || 1);
    maxSize = Math.max(maxSize, fontSize);
    const key = styleKey(run, edit);
    let style = cache.get(key);
    if (!style) {
      const fontLike = {
        ...edit,
        fontFamily: run.fontFamily ?? edit.fontFamily,
        fontSize,
        fontWeight: run.fontWeight ?? edit.fontWeight,
        fontStyle: run.fontStyle ?? edit.fontStyle,
        fontName: edit.fontSource === "imported-latin" ? edit.fontName : run.fontName ?? edit.fontName
      };
      style = { font: addFontResource(pdf, page, fontLike), fontSize, color: run.color || edit.color || "#111111", source: run };
      cache.set(key, style);
    }
    for (const char of [...run.text]) chars.push({ char, style, width: measuredTextWidth(style.font, char, style.fontSize) });
  }
  const combined = chars.map((item) => item.char).join("");
  if (combined !== edit.text) {
    const fallbackRun: NativeTextEditRun = { text: edit.text, fontFamily: edit.fontFamily, fontSize: edit.fontSize, color: edit.color, fontWeight: edit.fontWeight, fontStyle: edit.fontStyle, fontName: edit.fontName };
    const style: PreparedStyle = { font: addFontResource(pdf, page, edit), fontSize: Math.max(1, edit.fontSize), color: edit.color || "#111111", source: fallbackRun };
    return { chars: [...edit.text].map((char) => ({ char, style, width: measuredTextWidth(style.font, char, style.fontSize) })), maxSize: style.fontSize };
  }
  return { chars, maxSize };
}

function trimLeadingWhitespace(chars: StyledChar[]): StyledChar[] {
  let index = 0;
  while (index < chars.length && chars[index].char !== "\n" && /\s/u.test(chars[index].char)) index += 1;
  return chars.slice(index);
}

function trimTrailingWhitespace(chars: StyledChar[]): StyledChar[] {
  let end = chars.length;
  while (end > 0 && chars[end - 1].char !== "\n" && /\s/u.test(chars[end - 1].char)) end -= 1;
  return chars.slice(0, end);
}

function lineOf(chars: StyledChar[]): StyledLine {
  const clean = trimTrailingWhitespace(chars);
  return { chars: clean, width: clean.reduce((sum, item) => sum + item.width, 0) };
}

function wrapStyled(chars: StyledChar[], width: number | number[], wrap: boolean): StyledLine[] {
  const widths = Array.isArray(width) && width.length ? width : [Number(width)];
  const safeWidth = () => Math.max(1, (widths[Math.min(lines.length, widths.length - 1)] ?? 1) - 3);
  const lines: StyledLine[] = [];
  let current: StyledChar[] = [];
  let currentWidth = 0;

  const flush = () => {
    lines.push(lineOf(current));
    current = [];
    currentWidth = 0;
  };

  for (const item of chars) {
    if (item.char === "\n") { flush(); continue; }
    if (!wrap) {
      current.push(item);
      currentWidth += item.width;
      continue;
    }
    if (current.length && currentWidth + item.width > safeWidth()) {
      let breakIndex = -1;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (/\s/u.test(current[index].char)) { breakIndex = index; break; }
      }
      if (breakIndex >= 0) {
        const before = current.slice(0, breakIndex);
        const remainder = trimLeadingWhitespace(current.slice(breakIndex + 1));
        lines.push(lineOf(before));
        current = remainder;
        currentWidth = current.reduce((sum, value) => sum + value.width, 0);
      } else flush();
    }
    if (!current.length && /\s/u.test(item.char)) continue;
    current.push(item);
    currentWidth += item.width;
    if (wrap && currentWidth > safeWidth() && current.length === 1) flush();
  }
  if (current.length || !lines.length) lines.push(lineOf(current));
  return lines;
}

function axisOverlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1, Math.min(a1 - a0, b1 - b0));
}

function textSourceLineRegions(edit: any): NativeRect[] {
  const regions = textSourceRegions(edit);
  if (regions.length <= 1 || Number(edit.writingMode) === 1) return regions;
  const groups: NativeRect[][] = [];
  const ordered = [...regions].sort((left, right) => left.y - right.y || left.x - right.x);
  for (const region of ordered) {
    const group = groups.find((items) => items.some((item) =>
      axisOverlap(item.y, item.y + item.h, region.y, region.y + region.h) >= 0.55
      || Math.abs(item.y - region.y) <= Math.max(item.h, region.h) * 0.35
    ));
    group ? group.push(region) : groups.push([region]);
  }
  return groups.map((items) => {
    const x = Math.min(...items.map((item) => item.x));
    const y = Math.min(...items.map((item) => item.y));
    const x1 = Math.max(...items.map((item) => item.x + item.w));
    const y1 = Math.max(...items.map((item) => item.y + item.h));
    return { x, y, w: x1 - x, h: y1 - y };
  }).sort((left, right) => left.y - right.y || left.x - right.x);
}

function sameRect(left: NativeRect | undefined, right: NativeRect | undefined, tolerance = 0.5): boolean {
  if (!left || !right) return false;
  return Math.abs(left.x - right.x) <= tolerance
    && Math.abs(left.y - right.y) <= tolerance
    && Math.abs(left.w - right.w) <= tolerance
    && Math.abs(left.h - right.h) <= tolerance;
}

function retainedSourceLines(edit: any): Array<{ text: string; bounds: NativeRect }> {
  if (!Array.isArray(edit.sourceLines)) return [];
  return edit.sourceLines.filter((line: any) => typeof line?.text === "string" && validRedactionRect(line?.bounds));
}

function changedRange(left: string, right: string): { sourceStart: number; sourceEnd: number; delta: number } {
  let prefix = 0;
  const limit = Math.min(left.length, right.length);
  while (prefix < limit && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < left.length - prefix
    && suffix < right.length - prefix
    && left[left.length - suffix - 1] === right[right.length - suffix - 1]
  ) suffix += 1;
  return { sourceStart: prefix, sourceEnd: left.length - suffix, delta: right.length - left.length };
}

function retainedLineBreakOffsets(edit: any): number[] | null {
  const lines = retainedSourceLines(edit);
  if (lines.length <= 1 || typeof edit.originalText !== "string" || typeof edit.text !== "string") return null;
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const line of lines) {
    const value = line.text.trim();
    if (!value) return null;
    const start = edit.originalText.indexOf(value, cursor);
    if (start < 0) return null;
    ranges.push({ start, end: start + value.length });
    cursor = start + value.length;
  }
  const change = changedRange(edit.originalText, edit.text);
  const touched = ranges.filter((range) =>
    change.sourceStart === change.sourceEnd
      ? change.sourceStart >= range.start && change.sourceStart <= range.end
      : change.sourceStart < range.end && change.sourceEnd > range.start
  );
  if (touched.length > 1) return null;
  if (touched.length === 1 && (change.sourceStart < touched[0].start || change.sourceEnd > touched[0].end)) return null;
  return ranges.slice(0, -1).map((range) => {
    const utf16Offset = range.end <= change.sourceStart ? range.end : range.end + change.delta;
    return Array.from(edit.text.slice(0, utf16Offset)).length;
  });
}

function withRetainedLineBreaks(chars: StyledChar[], offsets: number[]): StyledChar[] {
  if (!offsets.length) return chars;
  const breaks = new Set(offsets.filter((offset) => offset > 0 && offset < chars.length));
  if (!breaks.size) return chars;
  const output: StyledChar[] = [];
  for (let index = 0; index < chars.length; index += 1) {
    if (breaks.has(index)) output.push({ ...chars[Math.max(0, index - 1)], char: "\n", width: 0 });
    output.push(chars[index]);
  }
  return output;
}

function chunks(line: StyledLine): Array<{ style: PreparedStyle; text: string; width: number }> {
  const output: Array<{ style: PreparedStyle; text: string; width: number }> = [];
  for (const item of line.chars) {
    const previous = output.at(-1);
    if (previous?.style === item.style) {
      previous.text += item.char;
      previous.width += item.width;
    } else output.push({ style: item.style, text: item.char, width: item.width });
  }
  return output;
}

function glyphHex(gid: number): string {
  if (!Number.isInteger(gid) || gid < 0 || gid > 0xffff) throw new Error("The shaping engine produced a glyph outside the qualified CID range.");
  return `<${gid.toString(16).padStart(4, "0")}>`;
}

function addShapedFontResource(pdf: PdfDocument, page: PdfPage, edit: any): { resource: string; font: any } {
  if (!edit.fontBytes?.byteLength) throw new Error("Arabic/RTL reconstruction requires a validated imported font.");
  const dictionary = resources(pdf, page, "Font");
  const resource = `LPSH${++sequence}`;
  const font = new (mupdf as any).Font(edit.fontName || "Imported Arabic", new Uint8Array(edit.fontBytes));
  if (typeof pdf.addFont !== "function") throw new Error("This MuPDF runtime cannot create the Identity-H font required for shaped text.");
  dictionary.put(resource, pdf.addFont(font));
  return { resource, font };
}

function shapedRunContent(run: ShapedVisualRun, resource: string, fontSize: number, color: string, x: number, y: number): string {
  const [r, g, b] = rgb(color);
  const signedAdvance = run.glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0);
  let penX = run.direction === "rtl" && signedAdvance < 0 ? x + run.width : x;
  let output = "";
  for (const glyph of run.glyphs) {
    const drawX = penX + glyph.xOffset;
    const drawY = y + glyph.yOffset;
    output += `BT /${resource} ${fontSize} Tf ${r} ${g} ${b} rg 1 0 0 1 ${drawX} ${drawY} Tm ${glyphHex(glyph.gid)} Tj ET\n`;
    penX += glyph.xAdvance;
  }
  return output;
}

function addShapedText(pdf: PdfDocument, page: PdfPage, edit: any): void {
  const [x0, y0, x1, y1] = pdfRect(page, edit.bounds);
  const width = x1 - x0;
  const height = y1 - y0;
  const fontSize = Math.max(1, Number(edit.fontSize) || 1);
  const baseDirection = edit.direction === "ltr" ? "ltr" : "rtl";
  const layout = shapeComplexText(new Uint8Array(edit.fontBytes ?? []), edit.text, fontSize, width, Boolean(edit.wrap), edit.lineHeight, baseDirection);
  if (layout.requiredHeight > height + 0.01) {
    throw new Error(`Arabic/RTL replacement does not fit the fixed text region (${layout.lines.length} lines require ${Number(layout.requiredHeight.toFixed(1))} pt, ${Number(height.toFixed(1))} pt available). Lower the font size or shorten the text.`);
  }
  if (layout.maxLineWidth > Math.max(1, width - 3) + 0.01) {
    throw new Error("Arabic/RTL replacement is wider than the fixed text region at the shaped font metrics. Lower the font size or shorten the text.");
  }

  const added = addShapedFontResource(pdf, page, edit);
  try {
    let content = "";
    if (edit.backgroundColor && edit.backgroundColor !== "transparent") {
      const [br, bg, bb] = rgb(edit.backgroundColor);
      content += `q ${br} ${bg} ${bb} rg ${x0} ${y0} ${width} ${height} re f Q\n`;
    }
    layout.lines.forEach((line, index) => {
      const startX = edit.align === "center"
        ? x0 + Math.max(0, (width - line.width) / 2)
        : edit.align === "left"
          ? x0 + 1.5
          : Math.max(x0, x1 - line.width - 1.5);
      const y = y1 - fontSize - index * layout.lineHeight;
      content += `/Span << /ActualText ${utf16Hex(line.logicalText)} >> BDC\n`;
      let visualX = startX;
      for (const run of line.runs) {
        content += shapedRunContent(run, added.resource, fontSize, edit.color || "#111111", visualX, y);
        visualX += run.width;
      }
      content += "EMC\n";
    });
    append(pdf, page, content);
  } finally {
    added.font.destroy?.();
  }
}

function addText(pdf: PdfDocument, page: PdfPage, edit: any): void {
  if (edit.fontSource === "imported-shaped") { addShapedText(pdf, page, edit); return; }
  if (edit.fontSource === "annotation-fallback") {
    const annotation = page.createAnnotation("FreeText");
    annotation.setRect(pageRect(edit.bounds));
    annotation.setContents(edit.text);
    annotation.setColor(rgb(edit.color));
    annotation.setDefaultAppearance?.("Helv", edit.fontSize, rgb(edit.color));
    annotation.update?.();
    return;
  }
  const [x0, y0, x1, y1] = pdfRect(page, edit.bounds);
  const width = x1 - x0;
  const height = y1 - y0;
  const prepared = prepareStyles(pdf, page, edit);
  const retainedLines = retainedSourceLines(edit);
  const sourceLineRegions = edit.layoutMode !== "expand-flow"
    && Boolean(edit.wrap)
    && sameRect(edit.bounds, edit.sourceBounds ?? edit.bounds)
    ? (retainedLines.length > 1 ? retainedLines.map((line) => line.bounds) : textSourceLineRegions(edit))
    : [];
  const sourceLineWidths = sourceLineRegions.length > 1
    ? sourceLineRegions.map((region) => Math.max(region.w, edit.bounds.w - Math.max(0, region.x - edit.bounds.x)))
    : [];
  const sourceBreaks = sourceLineWidths.length ? retainedLineBreakOffsets(edit) : null;
  const sourceChars = sourceBreaks ? withRetainedLineBreaks(prepared.chars, sourceBreaks) : prepared.chars;
  const sourceLines = sourceLineWidths.length ? wrapStyled(sourceChars, sourceLineWidths, true) : [];
  const sourceLayoutFits = sourceLineWidths.length > 0
    && sourceLines.length <= sourceLineRegions.length
    && sourceLines.every((line, index) => line.width <= Math.max(1, sourceLineWidths[index] - 3) + 0.01);
  const lines = sourceLayoutFits ? sourceLines : wrapStyled(prepared.chars, width, Boolean(edit.wrap));
  const lineHeight = Math.max(prepared.maxSize, Number(edit.lineHeight) || prepared.maxSize * 1.2);
  const requiredHeight = lines.length * lineHeight;
  if (!sourceLayoutFits && requiredHeight > height + 0.01) throw new Error(`Replacement text does not fit the destination at the retained line spacing (${lines.length} lines require ${Number(requiredHeight.toFixed(1))} pt, ${Number(height.toFixed(1))} pt available). Expand the text flow, lower the font size, or shorten the text.`);
  if (!edit.wrap && lines.some((line) => line.width > Math.max(1, width - 3))) throw new Error(`Replacement text is wider than the destination at the selected font metrics. Enable paragraph reflow, lower the font size, or shorten the text.`);
  let content = "";
  if (edit.backgroundColor && edit.backgroundColor !== "transparent") {
    const [br, bg, bb] = rgb(edit.backgroundColor);
    content += `q ${br} ${bg} ${bb} rg ${x0} ${y0} ${width} ${height} re f Q\n`;
  }
  lines.forEach((line, index) => {
    const sourceRegion = sourceLayoutFits ? sourceLineRegions[index] : undefined;
    const [sourceX0, _lineY0, sourceX1, lineY1] = sourceRegion ? pdfRect(page, sourceRegion) : [x0, y0, x1, y1];
    const lineX0 = sourceRegion ? Math.max(x0, sourceX0) : x0;
    const lineX1 = sourceRegion ? Math.max(sourceX1, x1) : x1;
    const lineWidth = lineX1 - lineX0;
    const startX = edit.align === "center" ? lineX0 + Math.max(0, (lineWidth - line.width) / 2) : edit.align === "right" ? Math.max(lineX0, lineX1 - line.width) : lineX0 + 1.5;
    const baselineSize = Math.max(prepared.maxSize, ...line.chars.map((item) => item.style.fontSize));
    const y = sourceRegion ? lineY1 - baselineSize : y1 - baselineSize - index * lineHeight;
    let cursor = startX;
    for (const chunk of chunks(line)) {
      const [r, g, b] = rgb(chunk.style.color);
      content += `BT /${chunk.style.font.resource} ${chunk.style.fontSize} Tf ${r} ${g} ${b} rg 1 0 0 1 ${cursor} ${y} Tm ${chunk.style.font.encode(chunk.text)} Tj ET\n`;
      cursor += chunk.width;
    }
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
              color: colorFromStructuredText(line.argb ?? line.color),
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
        const item: NativeVectorObject = { id: `p${index + 1}:vector:${vectorIndex}`, type: "vector", pageNumber: index + 1, bounds: fitzRectFromPdf(page, { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) }), commands, paint: "stroke", strokeColor: "#333333", strokeColorSpace: "RGB", strokeComponents: [0.2, 0.2, 0.2], lineWidth: 1, lineCap: "Butt", lineJoin: "Miter", miterLimit: 10, dashPattern: [], dashPhase: 0, fillAlpha: 1, strokeAlpha: 1, evenOdd: false, blendMode: "Normal", clipped: false, definesClip: false, sourceStreamIndex: 0, sourcePathIndex: vectorIndex, sourceSignature: `legacy-rectangle-${index + 1}-${vectorIndex}`, editability: "source-path", capability: vectorCapability(commands.length) };
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
  const redaction = page.createAnnotation("Redact");
  redaction.setRect(pageRect(bounds));
  redaction.update?.();
  page.applyRedactions(false, (mupdf as any).PDFPage.REDACT_IMAGE_PIXELS, (mupdf as any).PDFPage.REDACT_LINE_ART_REMOVE_IF_TOUCHED, (mupdf as any).PDFPage.REDACT_TEXT_REMOVE);
}

function validRedactionRect(value: unknown): value is NativeRect {
  if (!value || typeof value !== "object") return false;
  const rect = value as Partial<NativeRect>;
  return [rect.x, rect.y, rect.w, rect.h].every((item) => Number.isFinite(item))
    && Number(rect.w) > 0
    && Number(rect.h) > 0;
}

function textSourceRegions(edit: any): NativeRect[] {
  const precise = Array.isArray(edit.sourceRects) ? edit.sourceRects.filter(validRedactionRect) : [];
  if (precise.length) return precise;
  const fallback = edit.sourceBounds ?? edit.bounds;
  return validRedactionRect(fallback) ? [fallback] : [];
}

function redactTextOnly(page: PdfPage, regions: NativeRect[]): void {
  if (!regions.length) throw new Error("Native text edit has no valid source geometry to remove.");
  for (const bounds of regions) {
    const redaction = page.createAnnotation("Redact");
    redaction.setRect(pageRect(bounds));
    redaction.update?.();
  }
  page.applyRedactions(
    false,
    (mupdf as any).PDFPage.REDACT_IMAGE_NONE,
    (mupdf as any).PDFPage.REDACT_LINE_ART_NONE,
    (mupdf as any).PDFPage.REDACT_TEXT_REMOVE
  );
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

      // P2 redacts every original text source before writing any expanded or moved
      // replacement. This prevents a follower's old redaction rectangle from
      // deleting newly reflowed text that has already grown into that area.
      for (const edit of edits) {
        if (edit.kind !== "text" && edit.kind !== "table-cell") continue;
        if ((edit as any).mode === "overlay" || edit.originalText === undefined) continue;
        active(request.requestId);
        const page = pdf.loadPage(edit.pageNumber - 1);
        try {
          changed.add(edit.pageNumber);
          redactTextOnly(page, textSourceRegions(edit));
        } finally { page.destroy(); }
      }

      for (const edit of edits) {
        active(request.requestId);
        const page = pdf.loadPage(edit.pageNumber - 1);
        try {
          changed.add(edit.pageNumber);
          if (edit.kind === "text" || edit.kind === "table-cell") {
            addText(pdf, page, {
              ...edit,
              fontFamily: (edit as any).fontFamily ?? "Helvetica",
              color: (edit as any).color ?? "#111111",
              backgroundColor: (edit as any).backgroundColor ?? "transparent",
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
        if (edits.some((item) => item.kind === "text" && item.layoutMode === "expand-flow")) warnings.push("Layout-aware text reflow was applied only to explicitly queued same-column text blocks; unrelated page graphics were not moved.");
        const followerCount = edits.filter((item) => item.kind === "text" && item.reflowFollower).length;
        if (followerCount) warnings.push(`${followerCount} following text block${followerCount === 1 ? " was" : "s were"} repositioned to preserve the detected column flow.`);
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
