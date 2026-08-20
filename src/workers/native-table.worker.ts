import * as mupdf from "mupdf";
import type {
  NativeCapability,
  NativeEditableFontFamily,
  NativeExportReport,
  NativeRect,
  NativeTableCell,
  NativeTableDetectionSource,
  NativeTableEdit,
  NativeTableEditCell,
  NativeTableHorizontalAlign,
  NativeTableObject,
  NativeTableVerticalAlign
} from "../types/nativeEditor";

type Request =
  | { type: "INSPECT_TABLES"; requestId: string; bytes: ArrayBuffer; password?: string }
  | { type: "APPLY_TABLES"; requestId: string; bytes: ArrayBuffer; password?: string; edits?: NativeTableEdit[] }
  | { type: "CANCEL"; requestId: string };

type PdfDocument = any;
type PdfPage = any;
type Matrix = [number, number, number, number, number, number];

interface TextLine {
  text: string;
  bounds: NativeRect;
  fontSize: number;
  fontName: string;
  family: NativeEditableFontFamily;
  weight: string;
}

interface VectorBox {
  bounds: NativeRect;
  rectangle: boolean;
  stroked: boolean;
  color?: string;
  thin: boolean;
}

interface PageEvidence {
  lines: TextLine[];
  vectors: VectorBox[];
  images: NativeRect[];
  huntedTables: number;
}

interface TableInspection {
  pages: Array<{ pageNumber: number; tables: NativeTableObject[]; warnings: string[] }>;
  total: number;
  warnings: string[];
}

const cancelled = new Set<string>();
let resourceSequence = 0;

function active(id: string): void {
  if (cancelled.has(id)) throw new DOMException("Operation cancelled.", "AbortError");
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function finite(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function auth(pdf: PdfDocument, password?: string): void {
  if (pdf.needsPassword?.() && (!password || pdf.authenticatePassword(password) === 0)) throw new Error("The PDF password is required or incorrect.");
}

function rect(value: unknown): NativeRect {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const box = value as Record<string, unknown>;
    const x = finite(box.x);
    const y = finite(box.y);
    const w = finite(box.w);
    const h = finite(box.h);
    return { x: w >= 0 ? x : x + w, y: h >= 0 ? y : y + h, w: Math.abs(w), h: Math.abs(h) };
  }
  const values = Array.isArray(value) ? value.map(Number) : [];
  const x0 = finite(values[0]);
  const y0 = finite(values[1]);
  const x1 = finite(values[2], x0);
  const y1 = finite(values[3], y0);
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

function union(rects: NativeRect[]): NativeRect {
  if (!rects.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...rects.map((item) => item.x));
  const y = Math.min(...rects.map((item) => item.y));
  const x1 = Math.max(...rects.map((item) => item.x + item.w));
  const y1 = Math.max(...rects.map((item) => item.y + item.h));
  return { x, y, w: x1 - x, h: y1 - y };
}

function intersects(a: NativeRect, b: NativeRect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;
}

function containsPoint(bounds: NativeRect, x: number, y: number): boolean {
  return x >= bounds.x - 0.75 && x <= bounds.x + bounds.w + 0.75 && y >= bounds.y - 0.75 && y <= bounds.y + bounds.h + 0.75;
}

function colorHex(value: unknown): string | undefined {
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (Array.isArray(value) && value.length >= 3) {
    const channels = value.slice(0, 3).map((item) => Math.round(clamp(finite(item), 0, 1) * 255).toString(16).padStart(2, "0"));
    return `#${channels.join("")}`;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return `#${(numeric >>> 0 & 0xffffff).toString(16).padStart(6, "0")}`;
}

function editableFamily(family: unknown): NativeEditableFontFamily {
  const value = String(family ?? "");
  if (value === "serif") return "Times-Roman";
  if (value === "monospace") return "Courier";
  return "Helvetica";
}

function cluster(values: number[], tolerance = 2.25): number[] {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const value of sorted) {
    const group = groups.at(-1);
    if (group && Math.abs(value - group.reduce((sum, item) => sum + item, 0) / group.length) <= tolerance) group.push(value);
    else groups.push([value]);
  }
  return groups.map((group) => group.reduce((sum, item) => sum + item, 0) / group.length);
}

function nearestIndex(values: number[], target: number, tolerance = 3): number {
  let best = -1;
  let distance = Number.POSITIVE_INFINITY;
  values.forEach((value, index) => {
    const next = Math.abs(value - target);
    if (next < distance) { best = index; distance = next; }
  });
  return distance <= tolerance ? best : -1;
}

function tableCapability(confidence: number, complex: boolean, source: NativeTableDetectionSource): NativeCapability {
  if (complex) return {
    level: "unsupported",
    label: "Complex table content",
    confidence,
    reason: "A table grid was detected, but the table region also contains images or non-grid vector artwork that cannot be safely rebuilt as table structure.",
    preserves: ["Original PDF bytes", "Neighboring page content"],
    risks: ["Structured reconstruction is blocked so embedded graphics inside the table are not accidentally removed."]
  };
  return {
    level: "safe-reconstruction",
    label: "Structured table edit",
    confidence,
    reason: `${source === "mupdf-table-hunt" ? "MuPDF table-hunt and vector-grid evidence" : "Vector-grid evidence"} identify a bounded table that can be rebuilt as rows, columns and cells.`,
    preserves: ["Content outside the detected table region", "Images outside the table", "Page count", "Cell text semantics"],
    risks: ["The edited table is reconstructed as new PDF text and line art; original table operators, tagging and exact font subsets are not preserved byte-for-byte."]
  };
}

function extractEvidence(page: PdfPage): PageEvidence {
  const lines: TextLine[] = [];
  const vectors: VectorBox[] = [];
  const images: NativeRect[] = [];
  let huntedTables = 0;
  const structured = page.toStructuredText("preserve-spans,preserve-images,vectors,segment,table-hunt,lazy-vectors,structured");
  try {
    const json = safe(() => JSON.parse(structured.asJSON(1)), { blocks: [] });
    for (const block of json.blocks ?? []) {
      if (block.type !== "text") continue;
      for (const line of block.lines ?? []) {
        const text = String(line.text ?? "").trim();
        if (!text || !line.bbox) continue;
        lines.push({
          text,
          bounds: rect(line.bbox),
          fontSize: Math.max(4, finite(line.font?.size, 10)),
          fontName: String(line.font?.name ?? "Helvetica"),
          family: editableFamily(line.font?.family),
          weight: String(line.font?.weight ?? "normal")
        });
      }
    }
    structured.walk({
      beginStruct(standard: string, raw: string) {
        if (/^table$/i.test(String(standard)) || /^table$/i.test(String(raw))) huntedTables += 1;
      },
      onImageBlock(bbox: unknown) { images.push(rect(bbox)); },
      onVector(bbox: unknown, flags: any, rgb: unknown) {
        const bounds = rect(bbox);
        const thin = (bounds.w >= 20 && bounds.h <= Math.max(2.5, bounds.w * 0.025)) || (bounds.h >= 20 && bounds.w <= Math.max(2.5, bounds.h * 0.025));
        vectors.push({ bounds, rectangle: Boolean(flags?.isRectangle), stroked: Boolean(flags?.isStroked), color: colorHex(rgb), thin });
      }
    });
  } finally { structured.destroy?.(); }
  return { lines, vectors, images, huntedTables };
}

function connectedRectangleGroups(vectors: VectorBox[]): VectorBox[][] {
  const rectangles = vectors.filter((item) => item.rectangle && item.bounds.w >= 18 && item.bounds.h >= 8);
  const groups: VectorBox[][] = [];
  const seen = new Set<number>();
  for (let start = 0; start < rectangles.length; start += 1) {
    if (seen.has(start)) continue;
    const group: VectorBox[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const index = queue.shift() as number;
      const item = rectangles[index];
      group.push(item);
      for (let next = 0; next < rectangles.length; next += 1) {
        if (seen.has(next)) continue;
        const candidate = rectangles[next];
        const close = intersects(item.bounds, candidate.bounds, 2.5)
          || Math.abs(item.bounds.x + item.bounds.w - candidate.bounds.x) <= 2.5
          || Math.abs(candidate.bounds.x + candidate.bounds.w - item.bounds.x) <= 2.5
          || Math.abs(item.bounds.y + item.bounds.h - candidate.bounds.y) <= 2.5
          || Math.abs(candidate.bounds.y + candidate.bounds.h - item.bounds.y) <= 2.5;
        const sameBand = Math.max(0, Math.min(item.bounds.y + item.bounds.h, candidate.bounds.y + candidate.bounds.h) - Math.max(item.bounds.y, candidate.bounds.y)) > 2
          || Math.max(0, Math.min(item.bounds.x + item.bounds.w, candidate.bounds.x + candidate.bounds.w) - Math.max(item.bounds.x, candidate.bounds.x)) > 2;
        if (close && sameBand) { seen.add(next); queue.push(next); }
      }
    }
    groups.push(group);
  }
  return groups;
}

function lineGrid(vectors: VectorBox[]): { xs: number[]; ys: number[]; bounds: NativeRect } | null {
  const horizontal = vectors.filter((item) => item.thin && item.bounds.w >= 40 && item.bounds.w >= item.bounds.h * 5);
  const vertical = vectors.filter((item) => item.thin && item.bounds.h >= 30 && item.bounds.h >= item.bounds.w * 5);
  if (horizontal.length < 3 || vertical.length < 3) return null;
  const xs = cluster(vertical.map((item) => item.bounds.x + item.bounds.w / 2));
  const ys = cluster(horizontal.map((item) => item.bounds.y + item.bounds.h / 2));
  if (xs.length < 3 || ys.length < 3) return null;
  const bounds = { x: xs[0], y: ys[0], w: xs.at(-1)! - xs[0], h: ys.at(-1)! - ys[0] };
  return { xs, ys, bounds };
}

function inferAlign(line: TextLine | undefined, cell: NativeRect): NativeTableHorizontalAlign {
  if (!line) return "left";
  const left = line.bounds.x - cell.x;
  const right = cell.x + cell.w - (line.bounds.x + line.bounds.w);
  const center = Math.abs((line.bounds.x + line.bounds.w / 2) - (cell.x + cell.w / 2));
  if (center <= Math.min(Math.abs(left), Math.abs(right)) * 0.6 + 1) return "center";
  if (right + 1 < left) return "right";
  return "left";
}

function cellText(lines: TextLine[], bounds: NativeRect): { text: string; line?: TextLine } {
  const inside = lines.filter((line) => containsPoint(bounds, line.bounds.x + line.bounds.w / 2, line.bounds.y + line.bounds.h / 2))
    .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  return { text: inside.map((item) => item.text).join("\n"), line: inside[0] };
}

function sourceFill(vectors: VectorBox[], bounds: NativeRect): string | undefined {
  const match = vectors.find((item) => item.rectangle && !item.stroked && Math.abs(item.bounds.x - bounds.x) < 2 && Math.abs(item.bounds.y - bounds.y) < 2 && Math.abs(item.bounds.w - bounds.w) < 3 && Math.abs(item.bounds.h - bounds.h) < 3);
  return match?.color;
}

function makeCell(idPrefix: string, row: number, column: number, rowSpan: number, columnSpan: number, bounds: NativeRect, evidence: PageEvidence): NativeTableCell {
  const content = cellText(evidence.lines, bounds);
  return {
    id: `${idPrefix}:r${row}:c${column}`,
    row,
    column,
    rowSpan,
    columnSpan,
    text: content.text,
    bounds,
    fontSize: content.line?.fontSize ?? 10,
    fontFamily: content.line?.family ?? "Helvetica",
    fontName: content.line?.fontName,
    align: inferAlign(content.line, bounds),
    verticalAlign: "middle",
    fillColor: sourceFill(evidence.vectors, bounds),
    textColor: "#111111"
  };
}

function tableFromGrid(pageNumber: number, tableIndex: number, xs: number[], ys: number[], evidence: PageEvidence, source: NativeTableDetectionSource, rectangleGroup?: VectorBox[]): NativeTableObject | null {
  if (xs.length < 3 || ys.length < 3) return null;
  const rows = ys.length - 1;
  const columns = xs.length - 1;
  if (rows > 80 || columns > 30) return null;
  const tableBounds: NativeRect = { x: xs[0], y: ys[0], w: xs.at(-1)! - xs[0], h: ys.at(-1)! - ys[0] };
  const cells: NativeTableCell[] = [];
  const covered = new Set<string>();
  const idPrefix = `table:${pageNumber}:${tableIndex}`;

  const structuralRects = (rectangleGroup ?? [])
    .map((item) => {
      const c0 = nearestIndex(xs, item.bounds.x);
      const c1 = nearestIndex(xs, item.bounds.x + item.bounds.w);
      const r0 = nearestIndex(ys, item.bounds.y);
      const r1 = nearestIndex(ys, item.bounds.y + item.bounds.h);
      return { item, c0, c1, r0, r1, area: Math.max(0, c1 - c0) * Math.max(0, r1 - r0) };
    })
    .filter((item) => item.c0 >= 0 && item.r0 >= 0 && item.c1 > item.c0 && item.r1 > item.r0 && item.area <= Math.max(4, rows * columns - 1))
    .sort((a, b) => a.area - b.area);

  for (const candidate of structuralRects) {
    const key = `${candidate.r0}:${candidate.c0}`;
    if (covered.has(key)) continue;
    let available = true;
    for (let row = candidate.r0; row < candidate.r1; row += 1) for (let column = candidate.c0; column < candidate.c1; column += 1) if (covered.has(`${row}:${column}`)) available = false;
    if (!available) continue;
    for (let row = candidate.r0; row < candidate.r1; row += 1) for (let column = candidate.c0; column < candidate.c1; column += 1) covered.add(`${row}:${column}`);
    cells.push(makeCell(idPrefix, candidate.r0, candidate.c0, candidate.r1 - candidate.r0, candidate.c1 - candidate.c0, { x: xs[candidate.c0], y: ys[candidate.r0], w: xs[candidate.c1] - xs[candidate.c0], h: ys[candidate.r1] - ys[candidate.r0] }, evidence));
  }

  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    if (covered.has(`${row}:${column}`)) continue;
    cells.push(makeCell(idPrefix, row, column, 1, 1, { x: xs[column], y: ys[row], w: xs[column + 1] - xs[column], h: ys[row + 1] - ys[row] }, evidence));
  }

  const nonGridVector = evidence.vectors.some((item) => intersects(item.bounds, tableBounds) && !item.rectangle && !item.thin && item.bounds.w * item.bounds.h > 9);
  const imageInside = evidence.images.some((item) => intersects(item, tableBounds));
  const complexContent = imageInside || nonGridVector;
  const mergedCells = cells.filter((cell) => (cell.rowSpan ?? 1) > 1 || (cell.columnSpan ?? 1) > 1).length;
  const firstRow = cells.filter((cell) => cell.row === 0);
  const headerRows = firstRow.length && (firstRow.every((cell) => Boolean(cell.fillColor)) || evidence.lines.filter((line) => firstRow.some((cell) => containsPoint(cell.bounds, line.bounds.x + line.bounds.w / 2, line.bounds.y + line.bounds.h / 2))).every((line) => /bold/i.test(line.weight))) ? 1 : 0;
  const confidence = clamp(0.82 + Math.min(rows * columns, 12) * 0.008 + (source === "mupdf-table-hunt" ? 0.07 : 0) - (complexContent ? 0.08 : 0), 0.72, 0.98);
  const border = (rectangleGroup ?? []).find((item) => item.stroked && item.color);
  return {
    id: idPrefix,
    type: "table",
    pageNumber,
    bounds: tableBounds,
    rows,
    columns,
    cells,
    rowHeights: Array.from({ length: rows }, (_, row) => ys[row + 1] - ys[row]),
    columnWidths: Array.from({ length: columns }, (_, column) => xs[column + 1] - xs[column]),
    headerRows,
    mergedCells,
    borderColor: border?.color ?? "#444444",
    borderWidth: 1,
    cellPadding: 4,
    detectionSource: source,
    complexContent,
    confidence,
    editability: complexContent ? "unsupported" : "structured-table",
    capability: tableCapability(confidence, complexContent, source)
  };
}

function inspectPage(page: PdfPage, pageNumber: number): { tables: NativeTableObject[]; warnings: string[] } {
  const evidence = extractEvidence(page);
  const candidates: NativeTableObject[] = [];
  const groups = connectedRectangleGroups(evidence.vectors)
    .filter((group) => group.length >= 4)
    .sort((a, b) => b.length - a.length);
  for (const group of groups.slice(0, 8)) {
    const xs = cluster(group.flatMap((item) => [item.bounds.x, item.bounds.x + item.bounds.w]));
    const ys = cluster(group.flatMap((item) => [item.bounds.y, item.bounds.y + item.bounds.h]));
    const source: NativeTableDetectionSource = evidence.huntedTables ? "mupdf-table-hunt" : "vector-grid";
    const table = tableFromGrid(pageNumber, candidates.length, xs, ys, evidence, source, group);
    if (table && table.bounds.w >= 40 && table.bounds.h >= 20) candidates.push(table);
  }
  if (!candidates.length) {
    const grid = lineGrid(evidence.vectors);
    if (grid) {
      const table = tableFromGrid(pageNumber, 0, grid.xs, grid.ys, evidence, evidence.huntedTables ? "mupdf-table-hunt" : "vector-grid");
      if (table) candidates.push(table);
    }
  }
  const deduped = candidates.filter((table, index) => !candidates.slice(0, index).some((previous) => {
    const intersection = Math.max(0, Math.min(previous.bounds.x + previous.bounds.w, table.bounds.x + table.bounds.w) - Math.max(previous.bounds.x, table.bounds.x)) * Math.max(0, Math.min(previous.bounds.y + previous.bounds.h, table.bounds.y + table.bounds.h) - Math.max(previous.bounds.y, table.bounds.y));
    return intersection / Math.max(1, Math.min(previous.bounds.w * previous.bounds.h, table.bounds.w * table.bounds.h)) > 0.88;
  }));
  const warnings = evidence.huntedTables && !deduped.length ? ["MuPDF table-hunt reported table structure, but PDF Studio did not find a safe reconstructable grid for it."] : [];
  return { tables: deduped, warnings };
}

function inspect(pdf: PdfDocument, requestId: string): TableInspection {
  const pages: TableInspection["pages"] = [];
  const warnings: string[] = [];
  let total = 0;
  for (let index = 0; index < pdf.countPages(); index += 1) {
    active(requestId);
    const page = pdf.loadPage(index);
    try {
      const result = inspectPage(page, index + 1);
      pages.push({ pageNumber: index + 1, tables: result.tables, warnings: result.warnings });
      total += result.tables.length;
      warnings.push(...result.warnings.map((warning) => `Page ${index + 1}: ${warning}`));
    } finally { page.destroy?.(); }
  }
  return { pages, total, warnings };
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

function append(pdf: PdfDocument, page: PdfPage, content: string): void {
  const object = page.getObject();
  const stream = pdf.addStream(content);
  const current = object.get("Contents");
  if (!current?.isArray?.() && !current?.isStream?.() && !current?.isIndirect?.()) object.put("Contents", stream);
  else if (current.isArray?.()) current.push(stream);
  else {
    const array = pdf.newArray();
    array.push(current);
    array.push(stream);
    object.put("Contents", array);
  }
}

function pageRect(rectangle: NativeRect): [number, number, number, number] {
  return [rectangle.x, rectangle.y, rectangle.x + rectangle.w, rectangle.y + rectangle.h];
}

function point(matrix: Matrix | number[], x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

function pdfRect(page: PdfPage, rectangle: NativeRect): [number, number, number, number] {
  const matrix = page.getTransform?.() ?? [1, 0, 0, 1, 0, 0];
  const points = [point(matrix, rectangle.x, rectangle.y), point(matrix, rectangle.x + rectangle.w, rectangle.y), point(matrix, rectangle.x + rectangle.w, rectangle.y + rectangle.h), point(matrix, rectangle.x, rectangle.y + rectangle.h)];
  return [Math.min(...points.map((item) => item[0])), Math.min(...points.map((item) => item[1])), Math.max(...points.map((item) => item[0])), Math.max(...points.map((item) => item[1]))];
}

function rgb(hex?: string): [number, number, number] {
  const value = /^#[0-9a-f]{6}$/i.test(hex ?? "") ? (hex ?? "").slice(1) : "000000";
  return [parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255];
}

function winAnsiHex(text: string): string {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0xff) bytes.push(code);
    else bytes.push(0x3f);
  }
  return `<${bytes.map((value) => value.toString(16).padStart(2, "0")).join("")}>`;
}

function utf16Hex(text: string): string {
  let hex = "feff";
  for (let index = 0; index < text.length; index += 1) hex += text.charCodeAt(index).toString(16).padStart(4, "0");
  return `<${hex}>`;
}

function fontResource(pdf: PdfDocument, page: PdfPage, family: NativeEditableFontFamily): { name: string; encode: (text: string) => string } {
  const fonts = resources(pdf, page, "Font");
  const name = `LPSTBL${++resourceSequence}`;
  if (["ko", "ja", "zh-Hans", "zh-Hant"].includes(family)) {
    const font = new (mupdf as any).Font(family);
    fonts.put(name, pdf.addCJKFont(font, family, 0, "sans-serif"));
    font.destroy?.();
    return { name, encode: utf16Hex };
  }
  const base = family === "Times-Roman" ? "Times-Roman" : family === "Courier" ? "Courier" : "Helvetica";
  const font = new (mupdf as any).Font(base);
  fonts.put(name, pdf.addSimpleFont(font, "Latin"));
  font.destroy?.();
  return { name, encode: winAnsiHex };
}

function estimatedWidth(text: string, size: number): number {
  let units = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (/\s/u.test(char)) units += 0.28;
    else if ((code >= 0x2e80 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af)) units += 1;
    else if (/[ilI1|!.,:;'`]/u.test(char)) units += 0.28;
    else if (/[mwMW@%&#]/u.test(char)) units += 0.82;
    else units += 0.54;
  }
  return units * Math.max(1, size);
}

function wrap(text: string, width: number, size: number): string[] {
  const output: string[] = [];
  for (const logical of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = logical.trim().split(/\s+/u).filter(Boolean);
    if (!words.length) { output.push(""); continue; }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && estimatedWidth(next, size) > width) { output.push(line); line = word; }
      else line = next;
    }
    if (line) output.push(line);
  }
  return output.length ? output : [""];
}

function normalizeSizes(values: number[], count: number, total: number): number[] {
  const source = Array.from({ length: count }, (_, index) => Math.max(1, finite(values[index], total / Math.max(1, count))));
  const sum = source.reduce((value, item) => value + item, 0) || 1;
  return source.map((item) => item / sum * total);
}

function gridPositions(start: number, sizes: number[]): number[] {
  const result = [start];
  for (const size of sizes) result.push(result.at(-1)! + size);
  return result;
}

function validateCells(edit: NativeTableEdit): void {
  if (edit.rows < 1 || edit.columns < 1 || edit.rows > 100 || edit.columns > 50) throw new Error("Table dimensions are outside the supported editing range.");
  const occupied = new Set<string>();
  for (const cell of edit.cells) {
    if (cell.row < 0 || cell.column < 0 || cell.row >= edit.rows || cell.column >= edit.columns) throw new Error("A table cell is outside the edited table grid.");
    const rowSpan = Math.max(1, Math.floor(cell.rowSpan));
    const columnSpan = Math.max(1, Math.floor(cell.columnSpan));
    if (cell.row + rowSpan > edit.rows || cell.column + columnSpan > edit.columns) throw new Error("A merged cell extends beyond the edited table grid.");
    for (let row = cell.row; row < cell.row + rowSpan; row += 1) for (let column = cell.column; column < cell.column + columnSpan; column += 1) {
      const key = `${row}:${column}`;
      if (occupied.has(key)) throw new Error("Merged table cells overlap each other.");
      occupied.add(key);
    }
  }
}

function redrawTable(pdf: PdfDocument, page: PdfPage, edit: NativeTableEdit): void {
  validateCells(edit);
  if (edit.action === "delete") return;
  const rowHeights = normalizeSizes(edit.rowHeights, edit.rows, edit.bounds.h);
  const columnWidths = normalizeSizes(edit.columnWidths, edit.columns, edit.bounds.w);
  const xs = gridPositions(edit.bounds.x, columnWidths);
  const ys = gridPositions(edit.bounds.y, rowHeights);
  let content = "q\n";
  for (const cell of edit.cells) {
    const rowSpan = Math.max(1, Math.floor(cell.rowSpan));
    const columnSpan = Math.max(1, Math.floor(cell.columnSpan));
    const cellRect: NativeRect = { x: xs[cell.column], y: ys[cell.row], w: xs[cell.column + columnSpan] - xs[cell.column], h: ys[cell.row + rowSpan] - ys[cell.row] };
    if (cell.fillColor) {
      const [x0, y0, x1, y1] = pdfRect(page, cellRect);
      const [r, g, b] = rgb(cell.fillColor);
      content += `${r} ${g} ${b} rg ${x0} ${y0} ${x1 - x0} ${y1 - y0} re f\n`;
    }
  }
  if (edit.borderStyle !== "none" && edit.borderWidth > 0) {
    const [r, g, b] = rgb(edit.borderColor);
    content += `${r} ${g} ${b} RG ${Math.max(0.1, edit.borderWidth)} w ${edit.borderStyle === "dashed" ? "[5 3] 0 d" : "[] 0 d"}\n`;
    for (const cell of edit.cells) {
      const rowSpan = Math.max(1, Math.floor(cell.rowSpan));
      const columnSpan = Math.max(1, Math.floor(cell.columnSpan));
      const [x0, y0, x1, y1] = pdfRect(page, { x: xs[cell.column], y: ys[cell.row], w: xs[cell.column + columnSpan] - xs[cell.column], h: ys[cell.row + rowSpan] - ys[cell.row] });
      content += `${x0} ${y0} ${x1 - x0} ${y1 - y0} re S\n`;
    }
  }
  content += "Q\n";
  append(pdf, page, content);

  for (const cell of edit.cells) {
    if (!cell.text.trim()) continue;
    const rowSpan = Math.max(1, Math.floor(cell.rowSpan));
    const columnSpan = Math.max(1, Math.floor(cell.columnSpan));
    const box: NativeRect = { x: xs[cell.column], y: ys[cell.row], w: xs[cell.column + columnSpan] - xs[cell.column], h: ys[cell.row + rowSpan] - ys[cell.row] };
    const [x0, y0, x1, y1] = pdfRect(page, box);
    const padding = Math.max(0, edit.cellPadding);
    const availableWidth = Math.max(2, x1 - x0 - padding * 2);
    const availableHeight = Math.max(2, y1 - y0 - padding * 2);
    let fontSize = clamp(cell.fontSize, 4, 72);
    let lines = wrap(cell.text, availableWidth, fontSize);
    while (fontSize > 4 && lines.length * fontSize * 1.2 > availableHeight) {
      fontSize = Math.max(4, fontSize - 0.5);
      lines = wrap(cell.text, availableWidth, fontSize);
    }
    if (lines.length * fontSize * 1.2 > availableHeight + 0.1) throw new Error(`Table cell ${cell.row + 1},${cell.column + 1} does not fit after safe auto-fit.`);
    const font = fontResource(pdf, page, cell.fontFamily);
    const [tr, tg, tb] = rgb(cell.textColor);
    const lineHeight = fontSize * 1.2;
    const blockHeight = lines.length * lineHeight;
    const firstBaseline = cell.verticalAlign === "bottom" ? y0 + padding + blockHeight - fontSize : cell.verticalAlign === "middle" ? y0 + (y1 - y0 + blockHeight) / 2 - fontSize : y1 - padding - fontSize;
    let textContent = "";
    lines.forEach((line, index) => {
      const width = estimatedWidth(line, fontSize);
      const x = cell.align === "center" ? x0 + (x1 - x0 - width) / 2 : cell.align === "right" ? x1 - padding - width : x0 + padding;
      const y = firstBaseline - index * lineHeight;
      textContent += `BT /${font.name} ${fontSize} Tf ${tr} ${tg} ${tb} rg 1 0 0 1 ${x} ${y} Tm ${font.encode(line)} Tj ET\n`;
    });
    append(pdf, page, textContent);
  }
}

function removeSourceTable(page: PdfPage, sourceBounds: NativeRect): void {
  const annotation = page.createAnnotation("Redact");
  annotation.setRect(pageRect({ x: sourceBounds.x - 0.5, y: sourceBounds.y - 0.5, w: sourceBounds.w + 1, h: sourceBounds.h + 1 }));
  annotation.update?.();
  page.applyRedactions(false, (mupdf as any).PDFPage.REDACT_IMAGE_NONE, (mupdf as any).PDFPage.REDACT_LINE_ART_REMOVE_IF_TOUCHED, (mupdf as any).PDFPage.REDACT_TEXT_REMOVE);
}

function save(pdf: PdfDocument): Uint8Array {
  const buffer = pdf.saveToBuffer("garbage=4,clean=yes,compress=yes,compress-images=yes,compress-fonts=yes,appearance=all,encrypt=keep");
  try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy?.(); }
}

function comparable(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, "").trim();
}

function apply(pdf: PdfDocument, edits: NativeTableEdit[], requestId: string, password?: string): { output: Uint8Array; report: NativeExportReport } {
  const startedAt = performance.now();
  const changed = new Set<number>();
  for (const edit of edits) {
    active(requestId);
    const page = pdf.loadPage(edit.pageNumber - 1);
    try {
      changed.add(edit.pageNumber);
      removeSourceTable(page, edit.sourceBounds);
      redrawTable(pdf, page, edit);
    } finally { page.destroy?.(); }
  }
  const output = save(pdf);
  const reopened = new (mupdf as any).PDFDocument(output);
  try {
    auth(reopened, password);
    if (reopened.countPages() !== pdf.countPages()) throw new Error("Structured table validation failed: page count changed.");
    for (const edit of edits) {
      if (edit.action === "delete") continue;
      const page = reopened.loadPage(edit.pageNumber - 1);
      try {
        const text = comparable(page.toStructuredText().asText());
        for (const cell of edit.cells.filter((item) => item.text.trim())) {
          const target = comparable(cell.text);
          if (target && !text.includes(target)) throw new Error(`Structured table validation failed: cell text was not found after reopening page ${edit.pageNumber}.`);
        }
      } finally { page.destroy?.(); }
    }
    const report: NativeExportReport = {
      operation: "native-content-edit",
      pageCount: reopened.countPages(),
      outputBytes: output.byteLength,
      changedPages: [...changed].sort((a, b) => a - b),
      textEdits: 0,
      imageEdits: 0,
      vectorEdits: 0,
      tableCellEdits: edits.reduce((sum, edit) => sum + (edit.action === "delete" ? 0 : edit.cells.length), 0),
      formEdits: 0,
      warnings: [
        "P5 reconstructs edited tables as new PDF text and line art inside the detected table boundary; source table operators and semantic tags are not preserved byte-for-byte.",
        ...(edits.some((edit) => edit.cells.some((cell) => cell.rowSpan > 1 || cell.columnSpan > 1)) ? ["Merged-cell geometry was rebuilt from the structured P5 cell model."] : [])
      ],
      durationMs: performance.now() - startedAt
    };
    return { output, report };
  } finally { reopened.destroy?.(); }
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "CANCEL") { cancelled.add(request.requestId); return; }
  void (async () => {
    let pdf: PdfDocument | undefined;
    try {
      pdf = new (mupdf as any).PDFDocument(new Uint8Array(request.bytes));
      auth(pdf, request.password);
      safe(() => pdf.checkSyntax(), 0);
      if (request.type === "INSPECT_TABLES") {
        self.postMessage({ type: "TABLE_INSPECTION", requestId: request.requestId, inspection: inspect(pdf, request.requestId) });
        return;
      }
      const result = apply(pdf, request.edits ?? [], request.requestId, request.password);
      const transferable = result.output.buffer.slice(result.output.byteOffset, result.output.byteOffset + result.output.byteLength);
      self.postMessage({ type: "NATIVE_RESULT", requestId: request.requestId, output: transferable, report: result.report }, [transferable]);
    } catch (error) {
      self.postMessage({ type: "NATIVE_ERROR", requestId: request.requestId, error: { message: error instanceof Error ? error.message : String(error) } });
    } finally {
      pdf?.destroy?.();
      cancelled.delete(request.requestId);
    }
  })();
};

self.postMessage({ type: "READY" });
