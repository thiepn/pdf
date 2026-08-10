import type { PDFDocumentProxy } from "pdfjs-dist";
import { buildJpegPdf, type JpegPdfPage } from "../pdf/jpegPdf";
import { canvasToBlob } from "../ocr/preprocess";

export interface RasterCompressionProfile { id: string; label: string; dpi: number; quality: number; description: string }
export const RASTER_PROFILES: RasterCompressionProfile[] = [
  { id: "screen", label: "Screen", dpi: 120, quality: 0.68, description: "Good for reading and email." },
  { id: "balanced", label: "Balanced", dpi: 150, quality: 0.76, description: "Moderate size with clearer images." },
  { id: "small", label: "Small file", dpi: 96, quality: 0.52, description: "Strong raster compression." },
  { id: "print", label: "Print", dpi: 220, quality: 0.88, description: "Larger output for printing." }
];

export interface RasterTransformOptions { grayscale?: boolean }

export async function rasterTransformPdf(document: PDFDocumentProxy, profile: RasterCompressionProfile, options: RasterTransformOptions = {}, signal?: AbortSignal, onProgress?: (completed: number, total: number) => void): Promise<Uint8Array> {
  const pages: JpegPdfPage[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    if (signal?.aborted) throw new DOMException("Compression cancelled.", "AbortError");
    const page = await document.getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      const scale = profile.dpi / 72;
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width)); canvas.height = Math.max(1, Math.round(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas compression is unavailable.");
      context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      if (options.grayscale) {
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        for (let offset = 0; offset < image.data.length; offset += 4) {
          const gray = Math.round(image.data[offset] * 0.2126 + image.data[offset + 1] * 0.7152 + image.data[offset + 2] * 0.0722);
          image.data[offset] = gray; image.data[offset + 1] = gray; image.data[offset + 2] = gray;
        }
        context.putImageData(image, 0, 0);
      }
      const jpeg = await canvasToBlob(canvas, "image/jpeg", profile.quality);
      pages.push({ jpeg: new Uint8Array(await jpeg.arrayBuffer()), pixelWidth: canvas.width, pixelHeight: canvas.height, pageWidth: base.width, pageHeight: base.height });
    } finally { page.cleanup(); }
    onProgress?.(pageNumber, document.numPages);
    if (pageNumber % 3 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return buildJpegPdf(pages, { title: options.grayscale ? "Grayscale PDF" : "Compressed PDF" });
}

export async function rasterCompressPdf(document: PDFDocumentProxy, profile: RasterCompressionProfile, signal?: AbortSignal, onProgress?: (completed: number, total: number) => void): Promise<Uint8Array> {
  return rasterTransformPdf(document, profile, {}, signal, onProgress);
}
