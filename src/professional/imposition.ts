import { openPdfWithPdfJs } from "../engines/pdfjs";
import { buildJpegPdf, type JpegPdfPage } from "../pdf/jpegPdf";

export interface ImpositionOptions {
  layout: "2-up" | "4-up" | "booklet";
  pageSize: "a4" | "a3";
  quality: "draft" | "standard" | "print";
  marginMm: number;
  gutterMm: number;
  drawBorders: boolean;
  cropMarks: boolean;
  registrationMarks: boolean;
  bookletDirection: "ltr" | "rtl";
}

const sizes = { a4: [595.28, 841.89], a3: [841.89, 1190.55] } as const;
const qualityScale = { draft: 1.5, standard: 2.25, print: 3 } as const;
const MM_TO_PT = 72 / 25.4;
export function mmToPdfPoints(mm: number): number { return Math.max(0, Number.isFinite(mm) ? mm : 0) * MM_TO_PT; }

export function bookletOrder(count: number, direction: "ltr" | "rtl" = "ltr"): Array<Array<number | null>> {
  const padded = Math.ceil(count / 4) * 4;
  const pages: Array<number | null> = Array.from({ length: padded }, (_, index) => index < count ? index + 1 : null);
  const sides: Array<Array<number | null>> = [];
  for (let sheet = 0; sheet < padded / 4; sheet += 1) {
    sides.push([pages[padded - 1 - sheet * 2], pages[sheet * 2]]);
    sides.push([pages[sheet * 2 + 1], pages[padded - 2 - sheet * 2]]);
  }
  return direction === "rtl" ? sides.map(side => [...side].reverse()) : sides;
}

function groups(count: number, options: ImpositionOptions): Array<Array<number | null>> {
  if (options.layout === "booklet") return bookletOrder(count, options.bookletDirection);
  const perSheet = options.layout === "4-up" ? 4 : 2, result: Array<Array<number | null>> = [];
  for (let index = 1; index <= count; index += perSheet) result.push(Array.from({ length: perSheet }, (_, offset) => index + offset <= count ? index + offset : null));
  return result;
}

function drawCropMarks(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, scale: number): void {
  const gap = 3 * scale, length = 10 * scale;
  context.save(); context.strokeStyle = "#000000"; context.lineWidth = Math.max(1, 0.5 * scale);
  const lines = [
    [x - gap - length, y, x - gap, y], [x, y - gap - length, x, y - gap],
    [x + width + gap, y, x + width + gap + length, y], [x + width, y - gap - length, x + width, y - gap],
    [x - gap - length, y + height, x - gap, y + height], [x, y + height + gap, x, y + height + gap + length],
    [x + width + gap, y + height, x + width + gap + length, y + height], [x + width, y + height + gap, x + width, y + height + gap + length]
  ];
  for (const [x0, y0, x1, y1] of lines) { context.beginPath(); context.moveTo(x0, y0); context.lineTo(x1, y1); context.stroke(); }
  context.restore();
}
function drawRegistrationMarks(context: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, scale: number): void {
  const radius = 6 * scale, positions = [[canvasWidth / 2, 14 * scale], [canvasWidth / 2, canvasHeight - 14 * scale], [14 * scale, canvasHeight / 2], [canvasWidth - 14 * scale, canvasHeight / 2]];
  context.save(); context.strokeStyle = "#000000"; context.lineWidth = Math.max(1, 0.5 * scale);
  for (const [x, y] of positions) { context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke(); context.beginPath(); context.moveTo(x - radius * 1.5, y); context.lineTo(x + radius * 1.5, y); context.moveTo(x, y - radius * 1.5); context.lineTo(x, y + radius * 1.5); context.stroke(); }
  context.restore();
}

export async function buildImposedPdf(bytes: Uint8Array, options: ImpositionOptions, password?: string, signal?: AbortSignal, onProgress?: (completed: number, total: number) => void): Promise<{ bytes: Uint8Array; sheetCount: number; warnings: string[] }> {
  const pdfDocument = await openPdfWithPdfJs(bytes, password);
  try {
    const sourceSize = sizes[options.pageSize], landscape = options.layout === "2-up" || options.layout === "booklet", pageWidth = landscape ? sourceSize[1] : sourceSize[0], pageHeight = landscape ? sourceSize[0] : sourceSize[1];
    const scale = qualityScale[options.quality], sheetGroups = groups(pdfDocument.numPages, options), output: JpegPdfPage[] = [];
    for (let sheetIndex = 0; sheetIndex < sheetGroups.length; sheetIndex += 1) {
      if (signal?.aborted) throw new DOMException("Print-layout creation cancelled.", "AbortError");
      const sheet = sheetGroups[sheetIndex], columns = 2, rows = options.layout === "4-up" ? 2 : 1;
      const canvas = document.createElement("canvas"); canvas.width = Math.round(pageWidth * scale); canvas.height = Math.round(pageHeight * scale);
      const context = canvas.getContext("2d", { alpha: false }); if (!context) throw new Error("Canvas imposition is unavailable.");
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
      const margin = mmToPdfPoints(options.marginMm) * scale, gutter = mmToPdfPoints(options.gutterMm) * scale;
      const cellWidth = (canvas.width - margin * 2 - gutter * (columns - 1)) / columns, cellHeight = (canvas.height - margin * 2 - gutter * (rows - 1)) / rows;
      for (let cellIndex = 0; cellIndex < sheet.length; cellIndex += 1) {
        const pageNumber = sheet[cellIndex]; if (!pageNumber) continue;
        const page = await pdfDocument.getPage(pageNumber); try {
          const viewport = page.getViewport({ scale: 1 }), fit = Math.min(cellWidth / viewport.width, cellHeight / viewport.height), renderViewport = page.getViewport({ scale: fit });
          const temp = document.createElement("canvas"); temp.width = Math.max(1, Math.round(renderViewport.width)); temp.height = Math.max(1, Math.round(renderViewport.height));
          const tempContext = temp.getContext("2d", { alpha: false }); if (!tempContext) throw new Error("Canvas page rendering is unavailable.");
          tempContext.fillStyle = "#ffffff"; tempContext.fillRect(0, 0, temp.width, temp.height); await page.render({ canvas: temp, canvasContext: tempContext, viewport: renderViewport }).promise;
          const column = cellIndex % columns, row = Math.floor(cellIndex / columns), cellX = margin + column * (cellWidth + gutter), cellY = margin + row * (cellHeight + gutter), x = cellX + (cellWidth - temp.width) / 2, y = cellY + (cellHeight - temp.height) / 2;
          context.drawImage(temp, x, y);
          if (options.drawBorders) { context.strokeStyle = "#777777"; context.lineWidth = Math.max(1, scale * 0.5); context.strokeRect(x, y, temp.width, temp.height); }
          if (options.cropMarks) drawCropMarks(context, x, y, temp.width, temp.height, scale);
        } finally { page.cleanup(); }
      }
      if (options.registrationMarks) drawRegistrationMarks(context, canvas.width, canvas.height, scale);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Print-layout image encoding failed.")), "image/jpeg", options.quality === "print" ? 0.94 : 0.9));
      output.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), pixelWidth: canvas.width, pixelHeight: canvas.height, pageWidth, pageHeight });
      onProgress?.(sheetIndex + 1, sheetGroups.length); await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    const warnings = ["Print-layout output is rasterized. Forms, annotations, links, signatures, layers, searchable text, and vector editability are not preserved.", ...(options.cropMarks || options.registrationMarks ? ["Printer marks are drawn into the raster sheet and should be verified against the target printer workflow before production."] : [])];
    return { bytes: buildJpegPdf(output, { title: "Imposed PDF" }), sheetCount: output.length, warnings };
  } finally { await pdfDocument.loadingTask.destroy(); }
}
