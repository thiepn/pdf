import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OcrPreprocessSettings } from "../types/ocr";
import { applyPreprocess, canvasToBlob } from "./preprocess";

export async function renderPdfPageForOcr(document: PDFDocumentProxy, pageNumber: number, settings: OcrPreprocessSettings): Promise<{ blob: Blob; width: number; height: number }> {
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
    return { blob: await canvasToBlob(canvas, "image/png"), width: canvas.width, height: canvas.height };
  } finally { page.cleanup(); }
}
