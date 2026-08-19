import type {
  NativeCapability,
  NativeFormFieldType,
  NativeInspection,
  NativePageObject,
  NativePageTree,
  NativeRect,
  NativeScript,
  NativeTableCell,
  NativeTableObject,
  NativeTextAlign,
  NativeTextDirection,
  NativeTextLine,
  NativeTextObject
} from "../types/nativeEditor";

export function detectScript(text: string): NativeScript {
  let latin = false;
  let ko = false;
  let ja = false;
  let hans = false;
  let hant = false;
  let complex = false;
  const hanOnlyJapanese = /日本|日本語/.test(text);
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x41 && code <= 0x24f) || (code >= 0x1e00 && code <= 0x1eff)) latin = true;
    else if ((code >= 0xac00 && code <= 0xd7af) || (code >= 0x1100 && code <= 0x11ff)) ko = true;
    else if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff)) ja = true;
    else if (code >= 0x4e00 && code <= 0x9fff) {
      if ("國學體龍門萬與為雲臺灣廣東書長會國華漢".includes(ch)) hant = true;
      else hans = true;
    } else if ((code >= 0x0590 && code <= 0x0dff) || (code >= 0xfb1d && code <= 0xfeff)) complex = true;
  }
  if (complex) return "complex";
  if (ko) return "cjk-ko";
  if (ja || hanOnlyJapanese) return "cjk-ja";
  if (hant) return "cjk-zh-hant";
  if (hans) return "cjk-zh-hans";
  if (latin || !text.trim()) return "latin";
  return "unknown";
}

function capability(level: NativeCapability["level"], label: string, confidence: number, reason: string, preserves: string[], risks: string[]): NativeCapability {
  return { level, label, confidence, reason, preserves, risks };
}

export function classifyTextEditability(text: string, fontName = ""): Pick<NativeTextObject, "script" | "editability" | "reason" | "capability"> {
  const script = detectScript(text);
  if (/type3|symbol|dingbat|identity/i.test(fontName)) {
    const reason = "The source font encoding cannot be reconstructed safely.";
    return { script, editability: "overlay-only", reason, capability: capability("appearance-only", "Appearance edit", 0.5, reason, ["Original source project"], ["Replacement is exported as an annotation overlay unless a compatible font is supplied."]) };
  }
  if (script === "latin") {
    const reason = "The text can be reconstructed inside its detected content region.";
    return { script, editability: "fixed-box", reason, capability: capability("safe-reconstruction", "Safe reconstruction", 0.92, reason, ["Page geometry", "Unchanged neighboring objects"], ["The original text operators and font resource are replaced rather than edited byte-for-byte."]) };
  }
  if (["cjk-ko", "cjk-ja", "cjk-zh-hans", "cjk-zh-hant"].includes(script)) {
    const reason = "The text can be rebuilt with a UTF-16 CJK CID font inside its detected content region.";
    return { script, editability: "cjk-fixed-box", reason, capability: capability("safe-reconstruction", "CJK reconstruction", 0.86, reason, ["Unicode text", "Page geometry"], ["Exact original glyph metrics may differ from the source font."]) };
  }
  if (script === "complex") {
    const reason = "This script requires shaping and bidirectional layout that the current browser editor does not safely reconstruct.";
    return { script, editability: "overlay-only", reason, capability: capability("appearance-only", "Appearance only", 0.45, reason, ["Original source project"], ["Static replacement is not attempted without a shaping engine."]) };
  }
  const reason = "The text encoding could not be classified safely.";
  return { script, editability: "unsupported", reason, capability: capability("unsupported", "Unsupported", 0.2, reason, ["Original source project"], ["Editing this object may corrupt text encoding."]) };
}

export function imageCapability(): NativeCapability {
  return capability("safe-reconstruction", "Region replacement", 0.9, "The detected image region can be replaced while leaving other page regions intact.", ["Page count", "Unchanged page regions"], ["Overlapping content inside the replacement region can be removed when permanent replacement is enabled."]);
}

export function vectorCapability(commandCount: number): NativeCapability {
  return capability("safe-reconstruction", "Vector reconstruction", commandCount <= 12 ? 0.84 : 0.68, "The detected path can be restyled or transformed by reconstructing its path commands.", ["Vector output", "Unchanged page regions"], ["Only the detected path region is reconstructed; complex clipping, blend modes, and inherited graphics state may differ."]);
}

export function tableCapability(confidence: number): NativeCapability {
  return capability("safe-reconstruction", "Cell reconstruction", confidence, "Detected table cells can be edited independently inside their existing boxes.", ["Table geometry", "Unedited cells"], ["Table detection is inferred from aligned text and may not capture merged cells or border semantics."]);
}

export function formCapability(type: NativeFormFieldType, readOnly: boolean, signed: boolean | null): NativeCapability {
  if (type === "signature" || signed) return capability("unsupported", "Signature protected", 1, "Signature fields are not modified by the unified content editor.", ["Existing signature field"], ["Changing signed fields can invalidate signatures."]);
  if (readOnly) return capability("unsupported", "Read only", 1, "This field is marked read-only in the PDF.", ["Field value and flags"], []);
  if (["text", "combobox", "listbox", "checkbox", "radiobutton"].includes(type)) return capability("native-safe", "Native field edit", 0.98, "The field value can be changed through the PDF widget API without flattening it.", ["Interactive form structure", "Field geometry"], []);
  return capability("unsupported", "Unsupported field", 0.5, "This field type is not value-editable in the unified editor.", ["Field structure"], []);
}

export function rectFromArray(value: unknown): NativeRect {
  const a = Array.isArray(value) ? value.map(Number) : [];
  const x0 = Number.isFinite(a[0]) ? a[0] : 0;
  const y0 = Number.isFinite(a[1]) ? a[1] : 0;
  const x1 = Number.isFinite(a[2]) ? a[2] : x0;
  const y1 = Number.isFinite(a[3]) ? a[3] : y0;
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

export function unionRects(rects: NativeRect[]): NativeRect {
  if (!rects.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: x1 - x, h: y1 - y };
}

interface Line { id: string; text: string; bounds: NativeRect; fontSize: number }

function overlap(a: NativeRect, b: NativeRect): number {
  return Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) / Math.max(1, Math.min(a.h, b.h));
}

export function detectTables(pageNumber: number, lines: Line[]): NativeTableObject[] {
  if (lines.length < 4) return [];
  const rows: Line[][] = [];
  for (const line of [...lines].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)) {
    const row = rows.find((items) => items.some((item) => overlap(item.bounds, line.bounds) >= 0.55));
    row ? row.push(line) : rows.push([line]);
  }
  const candidates = rows.filter((row) => row.length >= 2).map((row) => row.sort((a, b) => a.bounds.x - b.bounds.x));
  if (candidates.length < 2) return [];
  const columns = Math.max(...candidates.map((row) => row.length));
  const compatible = candidates.filter((row) => Math.abs(row.length - columns) <= 1);
  if (compatible.length < 2 || columns < 2) return [];
  const cells: NativeTableCell[] = [];
  compatible.forEach((row, ri) => row.forEach((line, ci) => cells.push({ id: `table:${pageNumber}:r${ri}:c${ci}:${line.id}`, row: ri, column: ci, text: line.text, bounds: line.bounds, fontSize: line.fontSize })));
  const confidence = Math.max(0.6, Math.min(0.94, 0.72 + compatible.length * 0.025 + columns * 0.02));
  return [{ id: `table:${pageNumber}:0`, type: "table", pageNumber, bounds: unionRects(cells.map((cell) => cell.bounds)), rows: compatible.length, columns, cells, confidence, editability: "cell-replace", capability: tableCapability(confidence) }];
}

/**
 * Conservative glyph-width model used by both preview planning and the native
 * export worker. It is intentionally more granular than the previous 0.52-em
 * character count, while remaining deterministic and dependency-free.
 */
export function estimatedTextWidth(text: string, size: number): number {
  let units = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (/\s/u.test(char)) units += 0.28;
    else if (code >= 0x2e80 && code <= 0x9fff) units += 1;
    else if (code >= 0xac00 && code <= 0xd7af) units += 1;
    else if (/[ilI1|!.,:;'`]/u.test(char)) units += 0.28;
    else if (/[mwMW@%&#]/u.test(char)) units += 0.82;
    else if (/[A-Z0-9]/u.test(char)) units += 0.62;
    else if (/[-–—_()[\]{}]/u.test(char)) units += 0.42;
    else units += 0.52;
  }
  return units * Math.max(1, size);
}

function splitLongToken(token: string, width: number, size: number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const char of [...token]) {
    const next = current + char;
    if (current && estimatedTextWidth(next, size) > width) {
      pieces.push(current);
      current = char;
    } else current = next;
  }
  if (current || !pieces.length) pieces.push(current);
  return pieces;
}

function wrapLogicalLine(text: string, width: number, size: number): string[] {
  const normalized = text.trim();
  if (!normalized) return [""];
  if (!/\s/u.test(normalized)) return splitLongToken(normalized, width, size);
  const words = normalized.split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (estimatedTextWidth(word, size) > width) {
      if (current) { lines.push(current); current = ""; }
      const pieces = splitLongToken(word, width, size);
      lines.push(...pieces.slice(0, -1));
      current = pieces.at(-1) ?? "";
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (current && estimatedTextWidth(candidate, size) > width) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}

export function wrapTextToBox(text: string, width: number, size: number): string[] {
  const safeWidth = Math.max(1, width - 3);
  const logical = text.replace(/\r\n?/g, "\n").split("\n");
  const lines = logical.flatMap((line) => wrapLogicalLine(line, safeWidth, size));
  return lines.length ? lines : [""];
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mode<T extends string | number>(values: T[], fallback: T): T {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = fallback;
  let count = -1;
  for (const [value, next] of counts) if (next > count) { best = value; count = next; }
  return best;
}

function textBlockKey(object: NativeTextObject): string {
  const match = /^p\d+:text:(\d+):/.exec(object.id);
  return match ? `${object.pageNumber}:${match[1]}` : object.id;
}

function sourceLine(object: NativeTextObject): NativeTextLine {
  return {
    objectId: object.id,
    text: object.text,
    bounds: object.bounds,
    fontName: object.fontName,
    family: object.family,
    size: object.size,
    weight: object.weight,
    style: object.style,
    writingMode: object.writingMode
  };
}

function orderedLines(lines: NativeTextObject[]): NativeTextObject[] {
  const vertical = lines.filter((line) => line.writingMode === 1).length > lines.length / 2;
  return [...lines].sort((a, b) => vertical
    ? b.bounds.x - a.bounds.x || a.bounds.y - b.bounds.y
    : a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
}

function startsCjk(text: string): boolean {
  const first = [...text.trim()][0];
  if (!first) return false;
  const code = first.codePointAt(0) ?? 0;
  return (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af) || (code >= 0x3040 && code <= 0x30ff);
}

export function joinTextLines(lines: Array<Pick<NativeTextObject, "text" | "script">>): string {
  let result = "";
  for (const line of lines) {
    const next = line.text.trim();
    if (!next) continue;
    if (!result) { result = next; continue; }
    const dehyphenate = /[A-Za-zÀ-ž]-$/u.test(result) && /^[a-zà-ž]/u.test(next);
    if (dehyphenate) {
      result = result.slice(0, -1) + next;
      continue;
    }
    const previous = [...result].at(-1) ?? "";
    const noSpace = startsCjk(next) || startsCjk(previous) || line.script.startsWith("cjk-");
    result += noSpace ? next : ` ${next}`;
  }
  return result;
}

function inferredLineHeight(lines: NativeTextObject[]): number {
  if (lines.length <= 1) return Math.max(lines[0]?.bounds.h ?? 0, (lines[0]?.size ?? 10) * 1.2);
  const ordered = orderedLines(lines);
  const vertical = ordered.filter((line) => line.writingMode === 1).length > ordered.length / 2;
  const advances: number[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const advance = vertical ? Math.abs(current.bounds.x - previous.bounds.x) : Math.abs(current.bounds.y - previous.bounds.y);
    if (advance > 0.1 && Number.isFinite(advance)) advances.push(advance);
  }
  return median(advances) || Math.max(median(lines.map((line) => line.bounds.h)), median(lines.map((line) => line.size)) * 1.2);
}

function deviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function inferredAlignment(lines: NativeTextObject[], bounds: NativeRect): NativeTextAlign {
  if (lines.length <= 1) return "left";
  const lefts = lines.map((line) => line.bounds.x - bounds.x);
  const rights = lines.map((line) => bounds.x + bounds.w - (line.bounds.x + line.bounds.w));
  const centers = lines.map((line) => line.bounds.x + line.bounds.w / 2 - (bounds.x + bounds.w / 2));
  const leftDeviation = deviation(lefts);
  const rightDeviation = deviation(rights);
  const centerDeviation = deviation(centers);
  if (centerDeviation + 0.75 < Math.min(leftDeviation, rightDeviation)) return "center";
  if (rightDeviation + 0.75 < leftDeviation) return "right";
  return "left";
}

function inferredDirection(script: NativeScript, writingMode: 0 | 1, text: string): NativeTextDirection {
  if (writingMode === 1) return "ttb";
  if (script === "complex" && /[\u0590-\u08ff\ufb1d-\ufeff]/u.test(text)) return "rtl";
  if (script === "unknown") return "unknown";
  return "ltr";
}

function mergeTextGroup(group: NativeTextObject[]): NativeTextObject {
  const lines = orderedLines(group);
  if (lines.length === 1) {
    const source = lines[0];
    return {
      ...source,
      paragraph: true,
      sourceObjectIds: [source.id],
      lines: [sourceLine(source)],
      lineCount: 1,
      lineHeight: inferredLineHeight(lines),
      align: "left",
      direction: inferredDirection(source.script, source.writingMode, source.text)
    };
  }
  const bounds = unionRects(lines.map((line) => line.bounds));
  const text = joinTextLines(lines);
  const fontName = mode(lines.map((line) => line.fontName), lines[0].fontName);
  const family = mode(lines.map((line) => line.family), lines[0].family);
  const size = median(lines.map((line) => line.size).filter((value) => value > 0)) || lines[0].size;
  const weight = mode(lines.map((line) => line.weight), lines[0].weight);
  const style = mode(lines.map((line) => line.style), lines[0].style);
  const writingMode = mode(lines.map((line) => line.writingMode), lines[0].writingMode) as 0 | 1;
  const classification = classifyTextEditability(text, fontName);
  const reason = classification.editability === "fixed-box" || classification.editability === "cjk-fixed-box"
    ? `MuPDF grouped ${lines.length} source lines into one text block. PDF Studio can edit and reflow the paragraph without merging it with neighboring columns or blocks.`
    : classification.reason;
  const preserves = [...new Set([...classification.capability.preserves, "Structured-text block boundary", "Source paragraph geometry"])];
  const risks = [...new Set([...classification.capability.risks, "Exact source glyph metrics can differ when the original embedded font cannot be reused."])];
  return {
    id: `${textBlockKey(lines[0])}:paragraph`,
    type: "text",
    pageNumber: lines[0].pageNumber,
    bounds,
    text,
    fontName,
    family,
    size,
    weight,
    style,
    writingMode,
    ...classification,
    reason,
    capability: {
      ...classification.capability,
      label: classification.capability.level === "safe-reconstruction" ? "Paragraph reflow" : classification.capability.label,
      confidence: Math.max(0, Math.min(1, classification.capability.confidence - 0.02)),
      reason,
      preserves,
      risks
    },
    paragraph: true,
    sourceObjectIds: lines.map((line) => line.id),
    lines: lines.map(sourceLine),
    lineCount: lines.length,
    lineHeight: inferredLineHeight(lines),
    align: inferredAlignment(lines, bounds),
    direction: inferredDirection(classification.script, writingMode, text)
  };
}

/**
 * P1 consumer text model: merge line-level objects emitted by the worker back
 * into MuPDF structured-text block paragraphs. The block index encoded by the
 * worker is the hard boundary, so columns/independent blocks are never joined.
 */
export function reconstructPageTextParagraphs(page: NativePageTree): NativePageTree {
  const groups = new Map<string, NativeTextObject[]>();
  for (const object of page.objects) {
    if (object.type !== "text") continue;
    const key = textBlockKey(object);
    const items = groups.get(key) ?? [];
    items.push(object);
    groups.set(key, items);
  }
  if (!groups.size) return page;
  const emitted = new Set<string>();
  const objects: NativePageObject[] = [];
  for (const object of page.objects) {
    if (object.type !== "text") { objects.push(object); continue; }
    const key = textBlockKey(object);
    if (emitted.has(key)) continue;
    emitted.add(key);
    objects.push(mergeTextGroup(groups.get(key) ?? [object]));
  }
  return { ...page, objects };
}

export function reconstructInspectionTextParagraphs(inspection: NativeInspection): NativeInspection {
  const pages = inspection.pages.map(reconstructPageTextParagraphs);
  const before = inspection.pages.reduce((sum, page) => sum + page.objects.filter((object) => object.type === "text").length, 0);
  const after = pages.reduce((sum, page) => sum + page.objects.filter((object) => object.type === "text").length, 0);
  const collapsed = Math.max(0, before - after);
  const warnings = collapsed > 0
    ? [...inspection.warnings, `P1 reconstructed ${before} detected text lines as ${after} editable paragraph blocks; structured-text block boundaries were preserved.`]
    : inspection.warnings;
  return { ...inspection, pages, totals: { ...inspection.totals, text: after }, warnings };
}

export function cjkLanguageForScript(script: NativeScript): "ko" | "ja" | "zh-Hans" | "zh-Hant" | undefined {
  if (script === "cjk-ko") return "ko";
  if (script === "cjk-ja") return "ja";
  if (script === "cjk-zh-hans") return "zh-Hans";
  if (script === "cjk-zh-hant") return "zh-Hant";
  return undefined;
}
