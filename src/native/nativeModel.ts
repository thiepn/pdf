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
  NativeTextObject,
  NativeTextRun
} from "../types/nativeEditor";
import { annotatePageTextFlows } from "./layoutReflow.ts";

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

/** Accepts both MuPDF StructuredText JSON bbox objects and ordinary PDF rect arrays. */
export function rectFromArray(value: unknown): NativeRect {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const box = value as Partial<Record<"x" | "y" | "w" | "h", unknown>>;
    const x = Number(box.x);
    const y = Number(box.y);
    const w = Number(box.w);
    const h = Number(box.h);
    if ([x, y, w, h].every(Number.isFinite)) {
      return {
        x: w >= 0 ? x : x + w,
        y: h >= 0 ? y : y + h,
        w: Math.abs(w),
        h: Math.abs(h)
      };
    }
  }
  const a = Array.isArray(value) ? value.map(Number) : [];
  const x0 = Number.isFinite(a[0]) ? a[0] : 0;
  const y0 = Number.isFinite(a[1]) ? a[1] : 0;
  const x1 = Number.isFinite(a[2]) ? a[2] : x0;
  const y1 = Number.isFinite(a[3]) ? a[3] : y0;
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

export function unionRects(rects: NativeRect[]): NativeRect {
  if (!rects.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const x1 = Math.max(...rects.map((rect) => rect.x + rect.w));
  const y1 = Math.max(...rects.map((rect) => rect.y + rect.h));
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
  compatible.forEach((row, rowIndex) => row.forEach((line, columnIndex) => cells.push({
    id: `table:${pageNumber}:r${rowIndex}:c${columnIndex}:${line.id}`,
    row: rowIndex,
    column: columnIndex,
    text: line.text,
    bounds: line.bounds,
    fontSize: line.fontSize
  })));
  const confidence = Math.max(0.6, Math.min(0.94, 0.72 + compatible.length * 0.025 + columns * 0.02));
  return [{ id: `table:${pageNumber}:0`, type: "table", pageNumber, bounds: unionRects(cells.map((cell) => cell.bounds)), rows: compatible.length, columns, cells, confidence, editability: "cell-replace", capability: tableCapability(confidence) }];
}

export function estimatedTextWidth(text: string, size: number): number {
  let units = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (/\s/u.test(char)) units += 0.28;
    else if ((code >= 0x2e80 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af)) units += 1;
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
  const logicalLines = text.replace(/\r\n?/g, "\n").split("\n");
  const lines = logicalLines.flatMap((line) => wrapLogicalLine(line, safeWidth, size));
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
    color: object.color,
    writingMode: object.writingMode
  };
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
    if (/[A-Za-zÀ-ž]-$/u.test(result) && /^[a-zà-ž]/u.test(next)) {
      result = result.slice(0, -1) + next;
      continue;
    }
    const previous = [...result].at(-1) ?? "";
    const noSpace = startsCjk(next) || startsCjk(previous) || line.script.startsWith("cjk-");
    result += noSpace ? next : ` ${next}`;
  }
  return result;
}

interface VisualLine {
  spans: NativeTextObject[];
  bounds: NativeRect;
  text: string;
}

function sameVisualLine(a: NativeTextObject, b: NativeTextObject): boolean {
  if (a.writingMode !== b.writingMode) return false;
  if (a.writingMode === 1) {
    const xOverlap = Math.max(0, Math.min(a.bounds.x + a.bounds.w, b.bounds.x + b.bounds.w) - Math.max(a.bounds.x, b.bounds.x));
    return xOverlap / Math.max(1, Math.min(a.bounds.w, b.bounds.w)) >= 0.55;
  }
  return overlap(a.bounds, b.bounds) >= 0.55 || Math.abs(a.bounds.y - b.bounds.y) <= Math.max(a.bounds.h, b.bounds.h) * 0.35;
}

function inlineText(spans: NativeTextObject[]): string {
  let text = "";
  let previous: NativeTextObject | undefined;
  for (const span of spans) {
    const value = span.text;
    if (!value) continue;
    if (previous && !/\s$/u.test(text) && !/^\s/u.test(value)) {
      const gap = span.bounds.x - (previous.bounds.x + previous.bounds.w);
      if (gap > Math.max(1.5, Math.min(previous.size, span.size) * 0.18)) text += " ";
    }
    text += value;
    previous = span;
  }
  return text.trim();
}

function visualLines(spans: NativeTextObject[]): VisualLine[] {
  const lines: NativeTextObject[][] = [];
  const ordered = [...spans].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  for (const span of ordered) {
    const line = lines.find((items) => items.some((item) => sameVisualLine(item, span)));
    line ? line.push(span) : lines.push([span]);
  }
  return lines
    .map((items) => {
      const vertical = items.filter((item) => item.writingMode === 1).length > items.length / 2;
      const sorted = [...items].sort((a, b) => vertical ? a.bounds.y - b.bounds.y : a.bounds.x - b.bounds.x);
      return { spans: sorted, bounds: unionRects(sorted.map((item) => item.bounds)), text: inlineText(sorted) };
    })
    .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
}

function inferredLineHeight(lines: VisualLine[], fallbackSize: number): number {
  if (lines.length <= 1) return Math.max(lines[0]?.bounds.h ?? 0, fallbackSize * 1.2);
  const advances: number[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const advance = Math.abs(lines[index].bounds.y - lines[index - 1].bounds.y);
    if (advance > 0.1 && Number.isFinite(advance)) advances.push(advance);
  }
  return median(advances) || Math.max(median(lines.map((line) => line.bounds.h)), fallbackSize * 1.2);
}

function deviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function inferredAlignment(lines: VisualLine[], bounds: NativeRect): NativeTextAlign {
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

interface StyledBuilder {
  text: string;
  runs: NativeTextRun[];
}

function appendRun(builder: StyledBuilder, value: string, source: NativeTextObject): void {
  if (!value) return;
  const start = builder.text.length;
  builder.text += value;
  const end = builder.text.length;
  const previous = builder.runs.at(-1);
  const sameStyle = previous
    && previous.fontName === source.fontName
    && previous.family === source.family
    && previous.size === source.size
    && previous.weight === source.weight
    && previous.style === source.style
    && previous.color === source.color
    && previous.writingMode === source.writingMode;
  if (sameStyle && previous.end === start) {
    previous.text += value;
    previous.end = end;
    previous.bounds = unionRects([previous.bounds, source.bounds]);
  } else builder.runs.push({
    text: value,
    start,
    end,
    bounds: source.bounds,
    fontName: source.fontName,
    family: source.family,
    size: source.size,
    weight: source.weight,
    style: source.style,
    color: source.color,
    writingMode: source.writingMode
  });
}

function trimLastCharacter(builder: StyledBuilder): void {
  if (!builder.text) return;
  builder.text = builder.text.slice(0, -1);
  const last = builder.runs.at(-1);
  if (!last) return;
  last.text = last.text.slice(0, -1);
  last.end = Math.max(last.start, last.end - 1);
  if (!last.text) builder.runs.pop();
}

function appendInline(builder: StyledBuilder, spans: NativeTextObject[]): void {
  let previous: NativeTextObject | undefined;
  for (const span of spans) {
    const value = span.text;
    if (!value) continue;
    if (previous && !/\s$/u.test(builder.text) && !/^\s/u.test(value)) {
      const gap = span.bounds.x - (previous.bounds.x + previous.bounds.w);
      if (gap > Math.max(1.5, Math.min(previous.size, span.size) * 0.18)) appendRun(builder, " ", previous);
    }
    appendRun(builder, value, span);
    previous = span;
  }
}

function buildStyledParagraph(lines: VisualLine[]): StyledBuilder {
  const builder: StyledBuilder = { text: "", runs: [] };
  lines.forEach((line, index) => {
    const firstSpan = line.spans[0];
    if (!firstSpan) return;
    if (index > 0 && builder.text) {
      const nextText = line.text.trim();
      if (/[A-Za-zÀ-ž]-$/u.test(builder.text) && /^[a-zà-ž]/u.test(nextText)) trimLastCharacter(builder);
      else {
        const previous = [...builder.text].at(-1) ?? "";
        const noSpace = startsCjk(nextText) || startsCjk(previous) || firstSpan.script.startsWith("cjk-");
        if (!noSpace) appendRun(builder, " ", builder.runs.length ? line.spans[0] : firstSpan);
      }
    }
    appendInline(builder, line.spans);
  });
  return builder;
}

function mergeTextGroup(group: NativeTextObject[]): NativeTextObject {
  const spans = [...group].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  const visuals = visualLines(spans);
  const styled = buildStyledParagraph(visuals);
  const source = spans[0];
  const bounds = unionRects(spans.map((span) => span.bounds));
  const text = styled.text || joinTextLines(spans);
  const fontName = mode(spans.map((span) => span.fontName), source.fontName);
  const family = mode(spans.map((span) => span.family), source.family);
  const size = median(spans.map((span) => span.size).filter((value) => value > 0)) || source.size;
  const weight = mode(spans.map((span) => span.weight), source.weight);
  const style = mode(spans.map((span) => span.style), source.style);
  const color = mode(spans.map((span) => span.color ?? ""), source.color ?? "") || undefined;
  const writingMode = mode(spans.map((span) => span.writingMode), source.writingMode) as 0 | 1;
  const classification = classifyTextEditability(text, fontName);
  const reason = classification.editability === "fixed-box" || classification.editability === "cjk-fixed-box"
    ? `MuPDF preserve-spans data was reconstructed as ${visuals.length} visual line${visuals.length === 1 ? "" : "s"}. PDF Studio retains source font/style runs while keeping the structured-text block boundary intact.`
    : classification.reason;
  return {
    id: `${textBlockKey(source)}:paragraph`,
    type: "text",
    pageNumber: source.pageNumber,
    bounds,
    text,
    fontName,
    family,
    size,
    weight,
    style,
    color,
    writingMode,
    ...classification,
    reason,
    capability: {
      ...classification.capability,
      label: classification.capability.level === "safe-reconstruction" ? "Layout-aware paragraph" : classification.capability.label,
      confidence: Math.max(0, Math.min(1, classification.capability.confidence - 0.02)),
      reason,
      preserves: [...new Set([...classification.capability.preserves, "Structured-text block boundary", "Source paragraph geometry", "Source font/style spans"])],
      risks: [...new Set([...classification.capability.risks, "Exact source glyph metrics can differ when the original embedded font cannot be reused."])]
    },
    paragraph: true,
    sourceObjectIds: spans.map((span) => span.id),
    lines: spans.map(sourceLine),
    runs: styled.runs,
    sourceSpanCount: spans.length,
    lineCount: Math.max(1, visuals.length),
    lineHeight: inferredLineHeight(visuals, size),
    align: inferredAlignment(visuals, bounds),
    direction: inferredDirection(classification.script, writingMode, text)
  };
}

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
  return annotatePageTextFlows({ ...page, objects });
}

export function reconstructInspectionTextParagraphs(inspection: NativeInspection): NativeInspection {
  const pages = inspection.pages.map(reconstructPageTextParagraphs);
  const before = inspection.pages.reduce((sum, page) => sum + page.objects.filter((object) => object.type === "text").length, 0);
  const after = pages.reduce((sum, page) => sum + page.objects.filter((object) => object.type === "text").length, 0);
  const collapsed = Math.max(0, before - after);
  const warnings = collapsed > 0
    ? [...inspection.warnings, `P2 reconstructed ${before} preserve-spans text records as ${after} editable paragraph blocks, retained mixed font/style spans, and annotated conservative same-column text flows.`]
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
