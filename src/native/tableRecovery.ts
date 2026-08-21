import type {
  NativeCapability,
  NativeEditableFontFamily,
  NativeInspection,
  NativeRect,
  NativeTableCell,
  NativeTableObject,
  NativeTextObject,
  NativeTextRun,
  NativeVectorObject
} from "../types/nativeEditor";

interface VectorInspectionLike {
  pages: Array<{ pageNumber: number; vectors: NativeVectorObject[]; warnings: string[] }>;
  total: number;
  warnings: string[];
}

interface TableInspectionLike {
  pages: Array<{ pageNumber: number; tables: NativeTableObject[]; warnings: string[] }>;
  total: number;
  warnings: string[];
}

interface GridCandidate {
  xs: number[];
  ys: number[];
  vectors: NativeVectorObject[];
  rectangles: NativeVectorObject[];
}

interface TextSegment {
  text: string;
  bounds: NativeRect;
  fontName: string;
  fontFamily: NativeEditableFontFamily;
  fontSize: number;
  color: string;
}

const TOLERANCE = 2.75;

function finite(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cluster(values: number[], tolerance = TOLERANCE): number[] {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const value of sorted) {
    const group = groups.at(-1);
    const average = group?.length ? group.reduce((sum, item) => sum + item, 0) / group.length : Number.NaN;
    if (group && Math.abs(value - average) <= tolerance) group.push(value);
    else groups.push([value]);
  }
  return groups.map((group) => group.reduce((sum, item) => sum + item, 0) / group.length);
}

function intersects(a: NativeRect, b: NativeRect, pad = 0): boolean {
  return a.x <= b.x + b.w + pad && a.x + a.w >= b.x - pad && a.y <= b.y + b.h + pad && a.y + a.h >= b.y - pad;
}

function overlapArea(a: NativeRect, b: NativeRect): number {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}

function containsCenter(bounds: NativeRect, child: NativeRect): boolean {
  const x = child.x + child.w / 2;
  const y = child.y + child.h / 2;
  return x >= bounds.x - 1 && x <= bounds.x + bounds.w + 1 && y >= bounds.y - 1 && y <= bounds.y + bounds.h + 1;
}

function isHorizontal(vector: NativeVectorObject): boolean {
  const { w, h } = vector.bounds;
  return w >= 36 && h <= Math.max(3, w * 0.035) && w >= h * 5;
}

function isVertical(vector: NativeVectorObject): boolean {
  const { w, h } = vector.bounds;
  return h >= 24 && w <= Math.max(3, h * 0.035) && h >= w * 5;
}

function rectanglePath(vector: NativeVectorObject): boolean {
  if (!vector.commands.length || vector.commands.some((command) => command.op === "C")) return false;
  if (vector.commands.at(-1)?.op !== "Z") return false;
  const points = vector.commands.filter((command): command is Extract<typeof command, { op: "M" | "L" }> => command.op === "M" || command.op === "L");
  if (points.length !== 4) return false;
  const xs = cluster(points.map((point) => point.x), 1.5);
  const ys = cluster(points.map((point) => point.y), 1.5);
  return xs.length === 2 && ys.length === 2 && vector.bounds.w >= 12 && vector.bounds.h >= 6;
}

function connectedGroups<T>(items: T[], connected: (a: T, b: T) => boolean): T[][] {
  const groups: T[][] = [];
  const seen = new Set<number>();
  for (let start = 0; start < items.length; start += 1) {
    if (seen.has(start)) continue;
    const queue = [start];
    const group: T[] = [];
    seen.add(start);
    while (queue.length) {
      const index = queue.shift() as number;
      group.push(items[index]);
      for (let next = 0; next < items.length; next += 1) {
        if (seen.has(next) || !connected(items[index], items[next])) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    groups.push(group);
  }
  return groups;
}

function rectangleCandidates(vectors: NativeVectorObject[]): GridCandidate[] {
  const rectangles = vectors.filter(rectanglePath);
  const groups = connectedGroups(rectangles, (a, b) => {
    const close = intersects(a.bounds, b.bounds, TOLERANCE)
      || Math.abs(a.bounds.x + a.bounds.w - b.bounds.x) <= TOLERANCE
      || Math.abs(b.bounds.x + b.bounds.w - a.bounds.x) <= TOLERANCE
      || Math.abs(a.bounds.y + a.bounds.h - b.bounds.y) <= TOLERANCE
      || Math.abs(b.bounds.y + b.bounds.h - a.bounds.y) <= TOLERANCE;
    const horizontalBand = Math.max(0, Math.min(a.bounds.y + a.bounds.h, b.bounds.y + b.bounds.h) - Math.max(a.bounds.y, b.bounds.y));
    const verticalBand = Math.max(0, Math.min(a.bounds.x + a.bounds.w, b.bounds.x + b.bounds.w) - Math.max(a.bounds.x, b.bounds.x));
    return close && (horizontalBand > 2 || verticalBand > 2);
  });
  return groups.filter((group) => group.length >= 4).map((group) => ({
    xs: cluster(group.flatMap((item) => [item.bounds.x, item.bounds.x + item.bounds.w])),
    ys: cluster(group.flatMap((item) => [item.bounds.y, item.bounds.y + item.bounds.h])),
    vectors: group,
    rectangles: group
  })).filter((candidate) => candidate.xs.length >= 3 && candidate.ys.length >= 3);
}

function lineCandidates(vectors: NativeVectorObject[]): GridCandidate[] {
  const horizontal = vectors.filter(isHorizontal);
  const vertical = vectors.filter(isVertical);
  if (horizontal.length < 3 || vertical.length < 3) return [];
  const all = [...horizontal, ...vertical];
  const groups = connectedGroups(all, (a, b) => {
    if (isHorizontal(a) === isHorizontal(b)) return false;
    return intersects(a.bounds, b.bounds, TOLERANCE);
  });
  return groups.map((group) => {
    const hs = group.filter(isHorizontal);
    const vs = group.filter(isVertical);
    return {
      xs: cluster(vs.map((item) => item.bounds.x + item.bounds.w / 2)),
      ys: cluster(hs.map((item) => item.bounds.y + item.bounds.h / 2)),
      vectors: group,
      rectangles: []
    };
  }).filter((candidate) => candidate.xs.length >= 3 && candidate.ys.length >= 3);
}

function candidateBounds(candidate: GridCandidate): NativeRect {
  return {
    x: candidate.xs[0],
    y: candidate.ys[0],
    w: candidate.xs.at(-1)! - candidate.xs[0],
    h: candidate.ys.at(-1)! - candidate.ys[0]
  };
}

function familyForText(object: NativeTextObject, run?: NativeTextRun): NativeEditableFontFamily {
  const family = run?.family ?? object.family;
  if (family === "serif") return "Times-Roman";
  if (family === "monospace") return "Courier";
  if (object.script === "cjk-ko") return "ko";
  if (object.script === "cjk-ja") return "ja";
  if (object.script === "cjk-zh-hans") return "zh-Hans";
  if (object.script === "cjk-zh-hant") return "zh-Hant";
  return "Helvetica";
}

function textSegments(page: NativeInspection["pages"][number]): TextSegment[] {
  const output: TextSegment[] = [];
  for (const object of page.objects) {
    if (object.type !== "text") continue;
    if (object.runs?.length) {
      for (const run of object.runs) if (run.text.trim()) output.push({
        text: run.text,
        bounds: run.bounds,
        fontName: run.fontName || object.fontName,
        fontFamily: familyForText(object, run),
        fontSize: Math.max(4, finite(run.size, object.size)),
        color: run.color ?? object.color ?? "#111111"
      });
      continue;
    }
    if (object.lines?.length) {
      for (const line of object.lines) if (line.text.trim()) output.push({
        text: line.text,
        bounds: line.bounds,
        fontName: line.fontName || object.fontName,
        fontFamily: familyForText(object),
        fontSize: Math.max(4, finite(line.size, object.size)),
        color: line.color ?? object.color ?? "#111111"
      });
      continue;
    }
    if (object.text.trim()) output.push({
      text: object.text,
      bounds: object.bounds,
      fontName: object.fontName,
      fontFamily: familyForText(object),
      fontSize: Math.max(4, object.size),
      color: object.color ?? "#111111"
    });
  }
  return output;
}

function nearestBoundary(values: number[], target: number): number {
  let index = 0;
  let distance = Number.POSITIVE_INFINITY;
  values.forEach((value, candidate) => {
    const next = Math.abs(value - target);
    if (next < distance) { index = candidate; distance = next; }
  });
  return index;
}

function cellTextForGrid(segments: TextSegment[], xs: number[], ys: number[]): Map<string, TextSegment[]> {
  const cells = new Map<string, TextSegment[]>();
  const columns = xs.length - 1;
  const rows = ys.length - 1;
  for (const segment of segments) {
    const centerY = segment.bounds.y + segment.bounds.h / 2;
    const rowBoundary = nearestBoundary(ys, centerY);
    const row = Math.max(0, Math.min(rows - 1, centerY < ys[rowBoundary] ? rowBoundary - 1 : rowBoundary));
    if (centerY < ys[0] - 1 || centerY > ys.at(-1)! + 1) continue;
    const centerX = segment.bounds.x + segment.bounds.w / 2;
    const wide = segment.bounds.w > (xs.at(-1)! - xs[0]) / Math.max(1, columns) * 1.35;
    const words = segment.text.trim().split(/\s+/u).filter(Boolean);
    if (wide && words.length >= 2 && words.length <= columns) {
      words.forEach((word, column) => {
        const key = `${row}:${column}`;
        const current = cells.get(key) ?? [];
        current.push({ ...segment, text: word, bounds: { x: xs[column], y: segment.bounds.y, w: xs[column + 1] - xs[column], h: segment.bounds.h } });
        cells.set(key, current);
      });
      continue;
    }
    if (centerX < xs[0] - 1 || centerX > xs.at(-1)! + 1) continue;
    const columnBoundary = nearestBoundary(xs, centerX);
    const column = Math.max(0, Math.min(columns - 1, centerX < xs[columnBoundary] ? columnBoundary - 1 : columnBoundary));
    const key = `${row}:${column}`;
    const current = cells.get(key) ?? [];
    current.push(segment);
    cells.set(key, current);
  }
  return cells;
}

function capability(confidence: number, complex: boolean): NativeCapability {
  if (complex) return {
    level: "unsupported",
    label: "Complex table content",
    confidence,
    reason: "A vector grid was detected, but the table region also contains images or unrelated artwork that cannot be safely reconstructed.",
    preserves: ["Original PDF bytes", "Neighboring page content"],
    risks: ["Structured reconstruction is blocked so embedded graphics are not accidentally removed."]
  };
  return {
    level: "safe-reconstruction",
    label: "Structured table edit",
    confidence,
    reason: "Source-accurate PDF vector paths form a bounded row/column grid that can be reconstructed as table cells.",
    preserves: ["Content outside the detected table region", "Images outside the table", "Page count", "Detected cell text"],
    risks: ["Edited tables are reconstructed as new PDF text and line art; original operators, tagging and exact font subsets are not preserved byte-for-byte."]
  };
}

function makeTable(
  page: NativeInspection["pages"][number],
  vectors: NativeVectorObject[],
  candidate: GridCandidate,
  tableIndex: number
): NativeTableObject | null {
  const xs = candidate.xs;
  const ys = candidate.ys;
  const rows = ys.length - 1;
  const columns = xs.length - 1;
  if (rows < 2 || columns < 2 || rows > 80 || columns > 30) return null;
  const bounds = candidateBounds(candidate);
  if (bounds.w < 40 || bounds.h < 20) return null;
  const segments = textSegments(page).filter((segment) => intersects(segment.bounds, bounds, 1));
  const content = cellTextForGrid(segments, xs, ys);
  const cells: NativeTableCell[] = [];
  const covered = new Set<string>();

  const structural = candidate.rectangles.map((vector) => {
    const c0 = nearestBoundary(xs, vector.bounds.x);
    const c1 = nearestBoundary(xs, vector.bounds.x + vector.bounds.w);
    const r0 = nearestBoundary(ys, vector.bounds.y);
    const r1 = nearestBoundary(ys, vector.bounds.y + vector.bounds.h);
    return { c0, c1, r0, r1, area: Math.max(0, c1 - c0) * Math.max(0, r1 - r0) };
  }).filter((item) => item.c1 > item.c0 && item.r1 > item.r0 && item.area > 1 && item.area < rows * columns)
    .sort((a, b) => a.area - b.area);

  for (const span of structural) {
    let available = true;
    for (let row = span.r0; row < span.r1; row += 1) for (let column = span.c0; column < span.c1; column += 1) if (covered.has(`${row}:${column}`)) available = false;
    if (!available) continue;
    for (let row = span.r0; row < span.r1; row += 1) for (let column = span.c0; column < span.c1; column += 1) covered.add(`${row}:${column}`);
    const pieces: TextSegment[] = [];
    for (let row = span.r0; row < span.r1; row += 1) for (let column = span.c0; column < span.c1; column += 1) pieces.push(...(content.get(`${row}:${column}`) ?? []));
    const first = pieces[0];
    cells.push({
      id: `table:${page.pageNumber}:${tableIndex}:r${span.r0}:c${span.c0}`,
      row: span.r0,
      column: span.c0,
      rowSpan: span.r1 - span.r0,
      columnSpan: span.c1 - span.c0,
      text: pieces.map((piece) => piece.text).join(" ").trim(),
      bounds: { x: xs[span.c0], y: ys[span.r0], w: xs[span.c1] - xs[span.c0], h: ys[span.r1] - ys[span.r0] },
      fontSize: first?.fontSize ?? 10,
      fontFamily: first?.fontFamily ?? "Helvetica",
      fontName: first?.fontName,
      align: "left",
      verticalAlign: "middle",
      textColor: first?.color ?? "#111111"
    });
  }

  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    if (covered.has(`${row}:${column}`)) continue;
    const pieces = content.get(`${row}:${column}`) ?? [];
    const first = pieces[0];
    cells.push({
      id: `table:${page.pageNumber}:${tableIndex}:r${row}:c${column}`,
      row,
      column,
      rowSpan: 1,
      columnSpan: 1,
      text: pieces.map((piece) => piece.text).join(" ").trim(),
      bounds: { x: xs[column], y: ys[row], w: xs[column + 1] - xs[column], h: ys[row + 1] - ys[row] },
      fontSize: first?.fontSize ?? 10,
      fontFamily: first?.fontFamily ?? "Helvetica",
      fontName: first?.fontName,
      align: "left",
      verticalAlign: "middle",
      textColor: first?.color ?? "#111111"
    });
  }

  const candidateIds = new Set(candidate.vectors.map((vector) => vector.id));
  const nonGridArtwork = vectors.some((vector) => !candidateIds.has(vector.id) && intersects(vector.bounds, bounds) && !isHorizontal(vector) && !isVertical(vector) && vector.bounds.w * vector.bounds.h > 9);
  const imageInside = page.objects.some((object) => object.type === "image" && intersects(object.bounds, bounds));
  const complex = nonGridArtwork || imageInside;
  const confidence = Math.max(0.76, Math.min(0.97, 0.86 + Math.min(rows * columns, 12) * 0.007 - (complex ? 0.08 : 0)));
  const mergedCells = cells.filter((cell) => (cell.rowSpan ?? 1) > 1 || (cell.columnSpan ?? 1) > 1).length;
  const firstStroke = candidate.vectors.find((vector) => vector.paint !== "fill" && vector.strokeColor);
  return {
    id: `table:${page.pageNumber}:${tableIndex}`,
    type: "table",
    pageNumber: page.pageNumber,
    bounds,
    rows,
    columns,
    cells,
    rowHeights: Array.from({ length: rows }, (_, row) => ys[row + 1] - ys[row]),
    columnWidths: Array.from({ length: columns }, (_, column) => xs[column + 1] - xs[column]),
    headerRows: 0,
    mergedCells,
    borderColor: firstStroke?.strokeColor ?? "#444444",
    borderWidth: firstStroke?.lineWidth ?? 1,
    cellPadding: 4,
    detectionSource: "vector-grid",
    complexContent: complex,
    confidence,
    editability: complex ? "unsupported" : "structured-table",
    capability: capability(confidence, complex)
  };
}

function recoverPageTables(page: NativeInspection["pages"][number], vectors: NativeVectorObject[]): NativeTableObject[] {
  const candidates = [...rectangleCandidates(vectors), ...lineCandidates(vectors)];
  const tables: NativeTableObject[] = [];
  for (const candidate of candidates) {
    const next = makeTable(page, vectors, candidate, tables.length);
    if (!next) continue;
    if (tables.some((table) => overlapArea(table.bounds, next.bounds) / Math.max(1, Math.min(table.bounds.w * table.bounds.h, next.bounds.w * next.bounds.h)) > 0.88)) continue;
    tables.push(next);
  }
  return tables;
}

export function recoverStructuredTables(
  base: NativeInspection,
  vector: VectorInspectionLike,
  specialist: TableInspectionLike
): TableInspectionLike {
  const pages = base.pages.map((page) => {
    const specialistPage = specialist.pages.find((candidate) => candidate.pageNumber === page.pageNumber);
    if (specialistPage?.tables.length) return specialistPage;
    const vectors = vector.pages.find((candidate) => candidate.pageNumber === page.pageNumber)?.vectors ?? [];
    const tables = recoverPageTables(page, vectors);
    return {
      pageNumber: page.pageNumber,
      tables,
      warnings: [
        ...(specialistPage?.warnings ?? []),
        ...(tables.length ? ["P5 recovered structured table geometry from the source-accurate vector inspector because MuPDF structured-text vector flags did not expose a reconstructable grid."] : [])
      ]
    };
  });
  const total = pages.reduce((sum, page) => sum + page.tables.length, 0);
  return {
    pages,
    total,
    warnings: [
      ...specialist.warnings,
      ...pages.flatMap((page) => page.warnings.filter((warning) => /recovered structured table/i.test(warning)).map((warning) => `Page ${page.pageNumber}: ${warning}`))
    ]
  };
}
