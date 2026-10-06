import { inspectNativePdf } from "../native/nativeClient";
import type {
  NativeImageObject,
  NativeInspection,
  NativePageTree,
  NativeRect,
  NativeTableCell,
  NativeTableObject,
  NativeTextObject,
  NativeTextRun
} from "../types/nativeEditor";
import { openPdfWithPdfJs } from "../engines/pdfjsBase";

const encoder = new TextEncoder();
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DOCX_IMAGE_REGIONS = 48;
const MAX_RENDER_PIXELS = 6_000_000;

export interface LayoutDocxRun {
  text: string;
  fontName: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color?: string;
  rtl: boolean;
}

export interface LayoutDocxParagraph {
  kind: "paragraph";
  id: string;
  bounds: NativeRect;
  align: "left" | "center" | "right" | "justify";
  rtl: boolean;
  runs: LayoutDocxRun[];
  spaceAfterPt: number;
}

export interface LayoutDocxCell {
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
  text: string;
  fontSize: number;
  align: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  textColor?: string;
  fillColor?: string;
}

export interface LayoutDocxTable {
  kind: "table";
  id: string;
  bounds: NativeRect;
  rows: number;
  columns: number;
  columnWidths: number[];
  cells: LayoutDocxCell[];
}

export interface LayoutDocxImage {
  kind: "image";
  id: string;
  bounds: NativeRect;
  bytes: Uint8Array;
  mime: "image/png";
}

export type LayoutDocxBlock = LayoutDocxParagraph | LayoutDocxTable | LayoutDocxImage;

export interface LayoutDocxPage {
  pageNumber: number;
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
  blocks: LayoutDocxBlock[];
}

export interface LayoutDocxModel {
  pages: LayoutDocxPage[];
  warnings: string[];
  report: {
    selectedPages: number[];
    paragraphCount: number;
    tableCount: number;
    imageCount: number;
    skippedComplexTables: number;
    skippedImages: number;
    multiColumnPages: number[];
  };
}

export interface LayoutAwareDocxResult {
  bytes: Uint8Array;
  mime: typeof DOCX_MIME;
  warnings: string[];
  report: LayoutDocxModel["report"];
}

interface BinaryZipFile { name: string; bytes: Uint8Array }

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}
function u32(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}
function concat(chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function storeBinaryZip(files: BinaryZipFile[]): Uint8Array {
  const entries: Array<BinaryZipFile & { crc: number; offset: number }> = [];
  const local: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.bytes);
    const header = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(file.bytes.byteLength), u32(file.bytes.byteLength),
      u16(name.byteLength), u16(0), name, file.bytes
    ]);
    entries.push({ ...file, crc, offset });
    local.push(header);
    offset += header.byteLength;
  }
  const central: Uint8Array[] = [];
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(entry.crc), u32(entry.bytes.byteLength), u32(entry.bytes.byteLength),
      u16(name.byteLength), u16(0), u16(0), u16(0), u16(0), u32(0), u32(entry.offset), name
    ]));
  }
  const localBytes = concat(local);
  const centralBytes = concat(central);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralBytes.byteLength), u32(localBytes.byteLength), u16(0)
  ]);
  return concat([localBytes, centralBytes, end]);
}

function xml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/[\ud800-\udfff]/gu, "\ufffd")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanFontName(value: string): string {
  const withoutSubset = value.replace(/^[A-Z]{6}\+/, "").replace(/^[-+]/, "").trim();
  if (!withoutSubset || /unknown|identity|type3/i.test(withoutSubset)) return "Arial";
  return withoutSubset.slice(0, 80);
}

function hexColor(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^#?([0-9a-f]{6})$/i);
  return match?.[1].toUpperCase();
}

function intersects(a: NativeRect, b: NativeRect): number {
  const width = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return width * height;
}

function overlapRatio(a: NativeRect, b: NativeRect): number {
  return intersects(a, b) / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}

function bottom(rect: NativeRect): number { return rect.y + rect.h; }
function right(rect: NativeRect): number { return rect.x + rect.w; }

function textRun(run: NativeTextRun | undefined, source: NativeTextObject, text: string): LayoutDocxRun {
  return {
    text,
    fontName: cleanFontName(run?.fontName || source.fontName),
    fontSize: Math.max(6, Math.min(72, run?.size || source.size || 11)),
    bold: (run?.weight || source.weight) === "bold",
    italic: (run?.style || source.style) === "italic",
    color: hexColor(run?.color || source.color),
    rtl: source.direction === "rtl"
  };
}

function paragraphFromText(source: NativeTextObject, nextY?: number): LayoutDocxParagraph {
  const runs = source.runs?.length
    ? source.runs.filter((run) => run.text.length > 0).map((run) => textRun(run, source, run.text))
    : [textRun(undefined, source, source.text)];
  const gap = nextY === undefined ? 6 : Math.max(0, nextY - bottom(source.bounds));
  return {
    kind: "paragraph",
    id: source.id,
    bounds: source.bounds,
    align: source.align === "center" || source.align === "right" ? source.align : "left",
    rtl: source.direction === "rtl",
    runs,
    spaceAfterPt: Math.max(0, Math.min(24, gap))
  };
}

function tableCell(source: NativeTableCell): LayoutDocxCell {
  return {
    row: source.row,
    column: source.column,
    rowSpan: Math.max(1, source.rowSpan ?? 1),
    columnSpan: Math.max(1, source.columnSpan ?? 1),
    text: source.text,
    fontSize: Math.max(6, Math.min(48, source.fontSize ?? 10)),
    align: source.align === "center" || source.align === "right" ? source.align : "left",
    verticalAlign: source.verticalAlign === "top" || source.verticalAlign === "bottom" ? source.verticalAlign : "middle",
    textColor: hexColor(source.textColor),
    fillColor: hexColor(source.fillColor)
  };
}

function tableFromNative(source: NativeTableObject): LayoutDocxTable {
  const equalWidth = source.bounds.w / Math.max(1, source.columns);
  return {
    kind: "table",
    id: source.id,
    bounds: source.bounds,
    rows: source.rows,
    columns: source.columns,
    columnWidths: source.columnWidths?.length === source.columns
      ? source.columnWidths.map((value) => Math.max(4, value))
      : Array.from({ length: source.columns }, () => equalWidth),
    cells: source.cells.map(tableCell)
  };
}

function textInsideTable(text: NativeTextObject, tables: NativeTableObject[]): boolean {
  return tables.some((table) => overlapRatio(text.bounds, table.bounds) >= 0.5);
}

function hasOverlappingColumnFlows(page: NativePageTree, texts: NativeTextObject[]): boolean {
  const groups = new Map<string, { bounds: NativeRect; items: NativeTextObject[] }>();
  for (const text of texts) {
    if (!text.flow) continue;
    const current = groups.get(text.flow.id);
    if (current) current.items.push(text);
    else groups.set(text.flow.id, { bounds: text.flow.bounds, items: [text] });
  }
  const values = [...groups.values()].filter((group) => group.items.length >= 2);
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const a = values[i].bounds, b = values[j].bounds;
      const vertical = Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y));
      const denominator = Math.max(1, Math.min(a.h, b.h));
      if (vertical / denominator >= 0.3 && Math.abs(a.x - b.x) >= page.width * 0.18) return true;
    }
  }
  return false;
}

type SortableBlock = LayoutDocxBlock & { flowId?: string; flowIndex?: number };

function readingOrder(page: NativePageTree, blocks: SortableBlock[], multiColumn: boolean): LayoutDocxBlock[] {
  if (!multiColumn) return [...blocks].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  const wide = blocks.filter((block) => block.bounds.w >= page.width * 0.62).sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  const narrow = blocks.filter((block) => block.bounds.w < page.width * 0.62);
  const output: LayoutDocxBlock[] = [];
  let top = page.originY - 1;
  const flushBand = (limit: number) => {
    const band = narrow.filter((block) => block.bounds.y >= top && block.bounds.y < limit && !output.includes(block));
    const flows = new Map<string, SortableBlock[]>();
    const loose: SortableBlock[] = [];
    for (const block of band) {
      if (block.flowId) {
        const items = flows.get(block.flowId) ?? [];
        items.push(block);
        flows.set(block.flowId, items);
      } else loose.push(block);
    }
    const flowGroups = [...flows.values()]
      .map((items) => items.sort((a, b) => (a.flowIndex ?? 0) - (b.flowIndex ?? 0) || a.bounds.y - b.bounds.y))
      .sort((a, b) => a[0].bounds.x - b[0].bounds.x);
    for (const group of flowGroups) output.push(...group);
    output.push(...loose.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x));
  };
  for (const block of wide) {
    flushBand(block.bounds.y);
    output.push(block);
    top = bottom(block.bounds);
  }
  flushBand(Number.POSITIVE_INFINITY);
  for (const block of blocks) if (!output.includes(block)) output.push(block);
  return output;
}

function inferredMargins(page: NativePageTree, blocks: LayoutDocxBlock[]): LayoutDocxPage["margins"] {
  if (!blocks.length) return { top: 36, right: 36, bottom: 36, left: 36 };
  const left = Math.min(...blocks.map((block) => block.bounds.x - page.originX));
  const top = Math.min(...blocks.map((block) => block.bounds.y - page.originY));
  const rightMargin = page.width - Math.max(...blocks.map((block) => right(block.bounds) - page.originX));
  const bottomMargin = page.height - Math.max(...blocks.map((block) => bottom(block.bounds) - page.originY));
  const clamp = (value: number) => Math.max(18, Math.min(72, Number.isFinite(value) ? value : 36));
  return { top: clamp(top), right: clamp(rightMargin), bottom: clamp(bottomMargin), left: clamp(left) };
}

export function createLayoutDocxModel(
  inspection: NativeInspection,
  selectedPages: number[],
  images = new Map<string, Uint8Array>(),
  imageSkipIds = new Set<string>()
): LayoutDocxModel {
  const warnings: string[] = [
    "Word output is reconstructed into editable document structures. Exact PDF line wrapping, floating-object positioning, and pagination can differ."
  ];
  const pages: LayoutDocxPage[] = [];
  let paragraphCount = 0, tableCount = 0, imageCount = 0, skippedComplexTables = 0, skippedImages = imageSkipIds.size;
  const multiColumnPages: number[] = [];

  for (const pageNumber of selectedPages) {
    const page = inspection.pages.find((candidate) => candidate.pageNumber === pageNumber);
    if (!page) {
      warnings.push(`Page ${pageNumber} could not be represented because native layout inspection did not return it.`);
      continue;
    }
    const nativeTables = page.objects.filter((object): object is NativeTableObject => object.type === "table");
    const supportedTables = nativeTables.filter((table) => table.editability !== "unsupported" && !table.complexContent && table.confidence >= 0.6);
    skippedComplexTables += nativeTables.length - supportedTables.length;
    const texts = page.objects.filter((object): object is NativeTextObject => object.type === "text" && object.text.trim().length > 0 && !textInsideTable(object, supportedTables));
    const multiColumn = hasOverlappingColumnFlows(page, texts);
    if (multiColumn) multiColumnPages.push(pageNumber);

    const sortedTexts = [...texts].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
    const blocks: SortableBlock[] = [];
    sortedTexts.forEach((text, index) => {
      const paragraph = paragraphFromText(text, sortedTexts[index + 1]?.bounds.y);
      blocks.push({ ...paragraph, flowId: text.flow?.id, flowIndex: text.flow?.index });
      paragraphCount += 1;
    });
    for (const table of supportedTables) {
      blocks.push(tableFromNative(table));
      tableCount += 1;
    }
    for (const image of page.objects.filter((object): object is NativeImageObject => object.type === "image")) {
      const bytes = images.get(image.id);
      if (!bytes) continue;
      blocks.push({ kind: "image", id: image.id, bounds: image.bounds, bytes, mime: "image/png" });
      imageCount += 1;
    }
    const ordered = readingOrder(page, blocks, multiColumn);
    pages.push({
      pageNumber,
      width: page.width,
      height: page.height,
      margins: inferredMargins(page, ordered),
      blocks: ordered
    });
  }

  if (skippedComplexTables) warnings.push(`${skippedComplexTables} table region(s) contained complex or low-confidence structure and were not emitted as editable Word tables.`);
  if (skippedImages) warnings.push(`${skippedImages} image region(s) were skipped because they were page-scale backgrounds, too small, or exceeded the browser-safe image budget.`);
  if (multiColumnPages.length) warnings.push(`Multi-column reading order was reconstructed heuristically on page(s) ${multiColumnPages.join(", ")}. Review column order in Word.`);
  const omittedArtwork = selectedPages.reduce((sum, pageNumber) => {
    const page = inspection.pages.find((candidate) => candidate.pageNumber === pageNumber);
    return sum + (page?.objects.filter((object) => object.type === "vector" || object.type === "complex").length ?? 0);
  }, 0);
  if (omittedArtwork) warnings.push("Vector artwork and nested PDF graphics are not converted into editable Word drawing objects; review decorative or diagram-heavy pages.");

  return {
    pages,
    warnings: [...new Set(warnings)],
    report: { selectedPages, paragraphCount, tableCount, imageCount, skippedComplexTables, skippedImages, multiColumnPages }
  };
}

function twips(points: number): number { return Math.max(1, Math.round(points * 20)); }
function halfPoints(points: number): number { return Math.max(12, Math.min(144, Math.round(points * 2))); }
function emu(points: number): number { return Math.max(1, Math.round(points * 12700)); }

function runXml(run: LayoutDocxRun): string {
  const properties = [
    `<w:rFonts w:ascii="${xml(run.fontName)}" w:hAnsi="${xml(run.fontName)}" w:eastAsia="${xml(run.fontName)}"/>`,
    `<w:sz w:val="${halfPoints(run.fontSize)}"/><w:szCs w:val="${halfPoints(run.fontSize)}"/>`,
    run.bold ? "<w:b/><w:bCs/>" : "",
    run.italic ? "<w:i/><w:iCs/>" : "",
    run.color ? `<w:color w:val="${run.color}"/>` : "",
    run.rtl ? "<w:rtl/>" : ""
  ].join("");
  return `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${xml(run.text)}</w:t></w:r>`;
}

function paragraphXml(block: LayoutDocxParagraph): string {
  const align = block.align === "justify" ? "both" : block.align;
  const pPr = `<w:pPr><w:jc w:val="${align}"/><w:spacing w:after="${twips(block.spaceAfterPt)}"/>${block.rtl ? "<w:bidi/>" : ""}</w:pPr>`;
  return `<w:p>${pPr}${block.runs.map(runXml).join("")}</w:p>`;
}

function cellParagraphXml(cell: LayoutDocxCell): string {
  const run: LayoutDocxRun = {
    text: cell.text,
    fontName: "Arial",
    fontSize: cell.fontSize,
    bold: false,
    italic: false,
    color: cell.textColor,
    rtl: false
  };
  return `<w:p><w:pPr><w:jc w:val="${cell.align}"/></w:pPr>${runXml(run)}</w:p>`;
}

function tableXml(block: LayoutDocxTable): string {
  const grid = block.columnWidths.map((width) => `<w:gridCol w:w="${twips(width)}"/>`).join("");
  const starts = new Map<string, LayoutDocxCell>();
  for (const cell of block.cells) starts.set(`${cell.row}:${cell.column}`, cell);
  const covered = (row: number, column: number): { cell: LayoutDocxCell; continuation: boolean } | undefined => {
    for (const cell of block.cells) {
      if (row < cell.row || row >= cell.row + cell.rowSpan || column < cell.column || column >= cell.column + cell.columnSpan) continue;
      return { cell, continuation: row !== cell.row };
    }
    return undefined;
  };
  const rows: string[] = [];
  for (let row = 0; row < block.rows; row += 1) {
    const cells: string[] = [];
    let column = 0;
    while (column < block.columns) {
      const start = starts.get(`${row}:${column}`);
      const cover = start ? { cell: start, continuation: false } : covered(row, column);
      if (!cover) {
        cells.push("<w:tc><w:tcPr/><w:p/></w:tc>");
        column += 1;
        continue;
      }
      const cell = cover.cell;
      if (column !== cell.column) { column += 1; continue; }
      const span = Math.max(1, cell.columnSpan);
      const tcPr = [
        `<w:tcW w:w="${twips(block.columnWidths.slice(cell.column, cell.column + span).reduce((sum, width) => sum + width, 0))}" w:type="dxa"/>`,
        span > 1 ? `<w:gridSpan w:val="${span}"/>` : "",
        cell.rowSpan > 1 ? (cover.continuation ? '<w:vMerge w:val="continue"/>' : '<w:vMerge w:val="restart"/>') : "",
        `<w:vAlign w:val="${cell.verticalAlign === "middle" ? "center" : cell.verticalAlign}"/>`,
        cell.fillColor ? `<w:shd w:val="clear" w:color="auto" w:fill="${cell.fillColor}"/>` : ""
      ].join("");
      cells.push(`<w:tc><w:tcPr>${tcPr}</w:tcPr>${cover.continuation ? "<w:p/>" : cellParagraphXml(cell)}</w:tc>`);
      column += span;
    }
    rows.push(`<w:tr>${cells.join("")}</w:tr>`);
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7B7B7"/><w:left w:val="single" w:sz="4" w:color="B7B7B7"/><w:bottom w:val="single" w:sz="4" w:color="B7B7B7"/><w:right w:val="single" w:sz="4" w:color="B7B7B7"/><w:insideH w:val="single" w:sz="4" w:color="D9D9D9"/><w:insideV w:val="single" w:sz="4" w:color="D9D9D9"/></w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows.join("")}</w:tbl>`;
}

function imageXml(block: LayoutDocxImage, relationshipId: string, drawingId: number, maxWidthPt: number): string {
  const width = Math.min(block.bounds.w, maxWidthPt);
  const ratio = width / Math.max(1, block.bounds.w);
  const height = Math.max(8, block.bounds.h * ratio);
  const cx = emu(width), cy = emu(height);
  return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${drawingId}" name="PDF image ${drawingId}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image${drawingId}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function sectionXml(page: LayoutDocxPage, nextPage: boolean): string {
  const portrait = page.height >= page.width;
  return `<w:sectPr>${nextPage ? '<w:type w:val="nextPage"/>' : ""}<w:pgSz w:w="${twips(page.width)}" w:h="${twips(page.height)}"${portrait ? "" : ' w:orient="landscape"'}/><w:pgMar w:top="${twips(page.margins.top)}" w:right="${twips(page.margins.right)}" w:bottom="${twips(page.margins.bottom)}" w:left="${twips(page.margins.left)}" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>`;
}

function sectionBreakParagraph(page: LayoutDocxPage): string {
  return `<w:p><w:pPr>${sectionXml(page, true)}</w:pPr></w:p>`;
}

export function buildLayoutAwareDocxPackage(title: string, model: LayoutDocxModel): Uint8Array {
  const media: BinaryZipFile[] = [];
  const relationships: string[] = [];
  let imageIndex = 0;
  let drawingId = 1;
  const body: string[] = [];

  model.pages.forEach((page, pageIndex) => {
    const maxWidth = Math.max(72, page.width - page.margins.left - page.margins.right);
    for (const block of page.blocks) {
      if (block.kind === "paragraph") body.push(paragraphXml(block));
      else if (block.kind === "table") body.push(tableXml(block));
      else {
        imageIndex += 1;
        const relationshipId = `rIdImage${imageIndex}`;
        const filename = `image${imageIndex}.png`;
        relationships.push(`<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${filename}"/>`);
        media.push({ name: `word/media/${filename}`, bytes: block.bytes });
        body.push(imageXml(block, relationshipId, drawingId++, maxWidth));
      }
    }
    if (pageIndex < model.pages.length - 1) body.push(sectionBreakParagraph(page));
  });

  const lastPage = model.pages.at(-1) ?? { pageNumber: 1, width: 595.276, height: 841.89, margins: { top: 36, right: 36, bottom: 36, left: 36 }, blocks: [] };
  body.push(sectionXml(lastPage, false));
  const now = new Date().toISOString();
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join("")}</w:body></w:document>`;
  const files: BinaryZipFile[] = [
    {
      name: "[Content_Types].xml",
      bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`)
    },
    {
      name: "_rels/.rels",
      bytes: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>')
    },
    { name: "word/document.xml", bytes: encoder.encode(documentXml) },
    {
      name: "word/_rels/document.xml.rels",
      bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join("")}</Relationships>`)
    },
    {
      name: "docProps/core.xml",
      bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:creator>PDF Studio</dc:creator><dc:description>Layout-aware editable export reconstructed locally from PDF structure.</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`)
    },
    {
      name: "docProps/app.xml",
      bytes: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>PDF Studio</Application></Properties>')
    },
    ...media
  ];
  return storeBinaryZip(files);
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The browser could not encode a DOCX image.")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

async function renderPageImageRegions(
  pdf: Awaited<ReturnType<typeof openPdfWithPdfJs>>,
  pageTree: NativePageTree,
  signal: AbortSignal,
  remainingBudget: number
): Promise<{ images: Map<string, Uint8Array>; skipped: Set<string> }> {
  const images = new Map<string, Uint8Array>();
  const skipped = new Set<string>();
  const objects = pageTree.objects.filter((object): object is NativeImageObject => object.type === "image");
  if (!objects.length) return { images, skipped };

  const eligible = objects.filter((object) => {
    const areaRatio = (object.bounds.w * object.bounds.h) / Math.max(1, pageTree.width * pageTree.height);
    const tiny = object.bounds.w < 10 || object.bounds.h < 10;
    if (tiny || areaRatio > 0.72 || images.size >= remainingBudget) { skipped.add(object.id); return false; }
    return true;
  }).slice(0, remainingBudget);
  for (const object of objects) if (!eligible.some((candidate) => candidate.id === object.id)) skipped.add(object.id);
  if (!eligible.length) return { images, skipped };

  signal.throwIfAborted();
  const page = await pdf.getPage(pageTree.pageNumber);
  const canvas = document.createElement("canvas");
  try {
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.max(0.2, Math.min(1.6, Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, baseViewport.width * baseViewport.height))));
    const viewport = page.getViewport({ scale });
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("DOCX image reconstruction needs canvas support.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const render = page.render({ canvas, canvasContext: context, viewport });
    const cancel = () => render.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try { await render.promise; } finally { signal.removeEventListener("abort", cancel); }
    signal.throwIfAborted();

    for (const object of eligible) {
      const x = Math.max(0, Math.floor(((object.bounds.x - pageTree.originX) / Math.max(1, pageTree.width)) * canvas.width));
      const y = Math.max(0, Math.floor(((object.bounds.y - pageTree.originY) / Math.max(1, pageTree.height)) * canvas.height));
      const width = Math.max(1, Math.min(canvas.width - x, Math.ceil((object.bounds.w / Math.max(1, pageTree.width)) * canvas.width)));
      const height = Math.max(1, Math.min(canvas.height - y, Math.ceil((object.bounds.h / Math.max(1, pageTree.height)) * canvas.height)));
      if (width < 2 || height < 2) { skipped.add(object.id); continue; }
      const crop = document.createElement("canvas");
      try {
        crop.width = width;
        crop.height = height;
        const cropContext = crop.getContext("2d", { alpha: false });
        if (!cropContext) { skipped.add(object.id); continue; }
        cropContext.fillStyle = "#ffffff";
        cropContext.fillRect(0, 0, width, height);
        cropContext.drawImage(canvas, x, y, width, height, 0, 0, width, height);
        images.set(object.id, await canvasPng(crop));
      } finally {
        crop.width = 0;
        crop.height = 0;
      }
    }
  } finally {
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;
  }
  return { images, skipped };
}

export async function buildLayoutAwareDocx(
  bytes: Uint8Array,
  title: string,
  selectedPageIndexes: number[],
  password: string | undefined,
  signal: AbortSignal,
  onProgress?: (message: string) => void
): Promise<LayoutAwareDocxResult> {
  signal.throwIfAborted();
  const selectedPages = [...new Set(selectedPageIndexes.map((index) => index + 1))].sort((a, b) => a - b);
  if (!selectedPages.length) throw new Error("Choose at least one page for Word export.");

  onProgress?.("Inspecting paragraphs, tables and images…");
  const inspection = await inspectNativePdf(bytes, password, signal);
  signal.throwIfAborted();
  const selectedText = inspection.pages
    .filter((page) => selectedPages.includes(page.pageNumber))
    .flatMap((page) => page.objects.filter((object): object is NativeTextObject => object.type === "text"));
  if (!selectedText.some((object) => object.text.trim())) throw new Error("No selectable text was found. Use OCR PDF first to recognize text in scanned pages.");

  const pdf = await openPdfWithPdfJs(bytes, password);
  const images = new Map<string, Uint8Array>();
  const skipped = new Set<string>();
  try {
    let remaining = MAX_DOCX_IMAGE_REGIONS;
    for (const [index, pageNumber] of selectedPages.entries()) {
      signal.throwIfAborted();
      onProgress?.(`Reconstructing page ${pageNumber} (${index + 1} of ${selectedPages.length})…`);
      const pageTree = inspection.pages.find((page) => page.pageNumber === pageNumber);
      if (!pageTree || remaining <= 0) {
        if (pageTree) for (const object of pageTree.objects) if (object.type === "image") skipped.add(object.id);
        continue;
      }
      const rendered = await renderPageImageRegions(pdf, pageTree, signal, remaining);
      for (const [id, image] of rendered.images) images.set(id, image);
      for (const id of rendered.skipped) skipped.add(id);
      remaining = Math.max(0, MAX_DOCX_IMAGE_REGIONS - images.size);
    }
  } finally {
    await pdf.loadingTask.destroy();
  }

  signal.throwIfAborted();
  onProgress?.("Building editable Word document…");
  const model = createLayoutDocxModel(inspection, selectedPages, images, skipped);
  const output = buildLayoutAwareDocxPackage(title, model);
  return { bytes: output, mime: DOCX_MIME, warnings: model.warnings, report: model.report };
}
