import { createWorker } from "tesseract.js";
import type { OcrWord } from "../types/ocr";
import { ocrLanguageBaseUrl } from "./languagePackManager";
import { deploymentAssetUrl } from "../release/deployment";

export interface OcrProgressMessage { status: string; progress: number; userJobId?: string }
export interface OcrRecognitionResult {
  text: string;
  confidence: number;
  words: OcrWord[];
  hocr?: string;
  tsv?: string;
  searchablePdf?: Uint8Array;
}

function assetUrl(relative: string): string {
  return deploymentAssetUrl(relative);
}

function parseTsv(tsv: string | undefined): OcrWord[] {
  if (!tsv) return [];
  const lines = tsv.split(/\r?\n/);
  const header = lines.shift()?.split("\t") ?? [];
  const column = (name: string) => header.indexOf(name);
  const left = column("left"), top = column("top"), width = column("width"), height = column("height"), confidence = column("conf"), text = column("text"), level = column("level");
  if ([left, top, width, height, confidence, text].some((value) => value < 0)) return [];
  const words: OcrWord[] = [];
  for (const line of lines) {
    const cells = line.split("\t");
    if (level >= 0 && Number(cells[level]) !== 5) continue;
    const value = cells[text]?.trim();
    if (!value) continue;
    const x0 = Number(cells[left]); const y0 = Number(cells[top]);
    const w = Number(cells[width]); const h = Number(cells[height]);
    words.push({ text: value, confidence: Number(cells[confidence]) || 0, bbox: { x0, y0, x1: x0 + w, y1: y0 + h } });
  }
  return words;
}

export async function createOcrSession(languages: string[], onProgress?: (message: OcrProgressMessage) => void) {
  if (!languages.length) throw new Error("Select at least one installed OCR language.");
  const worker = await createWorker(languages, 1, {
    workerPath: assetUrl("tesseract/worker.min.js"),
    corePath: assetUrl("tesseract/core"),
    langPath: ocrLanguageBaseUrl(),
    cacheMethod: "none",
    logger: (message: OcrProgressMessage) => onProgress?.(message),
    errorHandler: (error: unknown) => console.error("OCR worker error", error)
  });
  let terminated = false;
  return {
    async recognize(image: Blob, jobId?: string): Promise<OcrRecognitionResult> {
      if (terminated) throw new Error("The OCR session is closed.");
      const result = await worker.recognize(image, {}, { text: true, blocks: true, hocr: true, tsv: true, pdf: true }, jobId);
      const data: Record<string, unknown> = Object.fromEntries(Object.entries(result.data));
      const tsv = typeof data.tsv === "string" ? data.tsv : undefined;
      const pdf = data.pdf;
      return {
        text: typeof data.text === "string" ? data.text.trim() : "",
        confidence: typeof data.confidence === "number" ? data.confidence : 0,
        words: parseTsv(tsv),
        hocr: typeof data.hocr === "string" ? data.hocr : undefined,
        tsv,
        searchablePdf: pdf instanceof Uint8Array
          ? Uint8Array.from(pdf)
          : pdf instanceof ArrayBuffer
            ? new Uint8Array(pdf.slice(0))
            : Array.isArray(pdf)
              ? Uint8Array.from(pdf)
              : undefined
      };
    },
    async terminate(): Promise<void> {
      if (terminated) return;
      terminated = true;
      await worker.terminate();
    }
  };
}
