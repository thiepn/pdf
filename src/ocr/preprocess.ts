import type { OcrPreprocessSettings } from "../types/ocr";

export const DEFAULT_OCR_PREPROCESS: OcrPreprocessSettings = {
  grayscale: true,
  contrast: 1.15,
  brightness: 0,
  threshold: null,
  invert: false,
  scale: 2
};

export function applyPreprocess(canvas: HTMLCanvasElement, settings: OcrPreprocessSettings): void {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas preprocessing is unavailable.");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const contrast = Math.max(0.1, settings.contrast);
  const brightness = Math.max(-255, Math.min(255, settings.brightness));
  for (let index = 0; index < data.length; index += 4) {
    let r = data[index]; let g = data[index + 1]; let b = data[index + 2];
    if (settings.grayscale || settings.threshold !== null) {
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      r = gray; g = gray; b = gray;
    }
    r = (r - 128) * contrast + 128 + brightness;
    g = (g - 128) * contrast + 128 + brightness;
    b = (b - 128) * contrast + 128 + brightness;
    if (settings.threshold !== null) {
      const level = (r + g + b) / 3 >= settings.threshold ? 255 : 0;
      r = level; g = level; b = level;
    }
    if (settings.invert) { r = 255 - r; g = 255 - g; b = 255 - b; }
    data[index] = Math.max(0, Math.min(255, Math.round(r)));
    data[index + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[index + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }
  context.putImageData(image, 0, 0);
}

export async function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image encoding failed.")), type, quality));
}
