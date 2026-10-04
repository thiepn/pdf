import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OcrPreprocessSettings } from "../types/ocr";
import type { NormalizedOcrRect } from "./ocrLayer";
import { applyPreprocess, canvasToBlob } from "./preprocess";

async function renderCanvas(document: PDFDocumentProxy, pageNumber: number, settings: OcrPreprocessSettings): Promise<HTMLCanvasElement> {
  const page = await document.getPage(pageNumber);
  try {
    const viewport = page.getViewport({ scale: Math.max(1, Math.min(4, settings.scale)) });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("Canvas rendering is unavailable.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    applyPreprocess(canvas, settings);
    return canvas;
  } finally { page.cleanup(); }
}

export async function renderPdfPageForOcr(document: PDFDocumentProxy, pageNumber: number, settings: OcrPreprocessSettings): Promise<{ blob: Blob; width: number; height: number }> {
  const canvas = await renderCanvas(document, pageNumber, settings);
  return { blob: await canvasToBlob(canvas, "image/png"), width: canvas.width, height: canvas.height };
}

export async function renderPdfRegionForOcr(
  document: PDFDocumentProxy,
  pageNumber: number,
  settings: OcrPreprocessSettings,
  region: NormalizedOcrRect
): Promise<{ blob: Blob; width: number; height: number; x: number; y: number; pageWidth: number; pageHeight: number }> {
  const source = await renderCanvas(document, pageNumber, settings);
  const x0 = Math.max(0, Math.min(source.width - 1, Math.floor(region.x0 * source.width)));
  const y0 = Math.max(0, Math.min(source.height - 1, Math.floor(region.y0 * source.height)));
  const x1 = Math.max(x0 + 1, Math.min(source.width, Math.ceil(region.x1 * source.width)));
  const y1 = Math.max(y0 + 1, Math.min(source.height, Math.ceil(region.y1 * source.height)));
  const canvas = window.document.createElement("canvas");
  canvas.width = x1 - x0;
  canvas.height = y1 - y0;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw new Error("Canvas rendering is unavailable.");
  context.drawImage(source, x0, y0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return {
    blob: await canvasToBlob(canvas, "image/png"),
    width: canvas.width,
    height: canvas.height,
    x: x0,
    y: y0,
    pageWidth: source.width,
    pageHeight: source.height
  };
}
