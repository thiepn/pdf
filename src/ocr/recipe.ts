import type { OcrPreprocessSettings } from "../types/ocr";

export const OCR_RECIPE_ENGINE = "tesseract-7/render-v2";

export interface OcrRecipeInput {
  pageNumbers: number[];
  languages: string[];
  preprocess: OcrPreprocessSettings;
}

function stableHash(value: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    a ^= code;
    a = Math.imul(a, 0x01000193) >>> 0;
    b ^= code + index;
    b = Math.imul(b, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

/** A resumable OCR page is reusable only when this complete recipe matches. */
export function buildOcrRecipeFingerprint(input: OcrRecipeInput): string {
  const normalized = {
    engine: OCR_RECIPE_ENGINE,
    pageNumbers: [...input.pageNumbers].map(Number),
    languages: [...input.languages],
    preprocess: {
      grayscale: Boolean(input.preprocess.grayscale),
      contrast: Number(input.preprocess.contrast),
      brightness: Number(input.preprocess.brightness),
      threshold: input.preprocess.threshold === null ? null : Number(input.preprocess.threshold),
      invert: Boolean(input.preprocess.invert),
      scale: Number(input.preprocess.scale)
    }
  };
  return `${OCR_RECIPE_ENGINE}:${stableHash(JSON.stringify(normalized))}`;
}
