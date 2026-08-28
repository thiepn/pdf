import type { OcrPreprocessSettings } from "../types/ocr";

export interface ScanOutputPageIdentity {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  type: string;
  rotation: number;
}

export interface ScanOutputRecipe {
  pages: ScanOutputPageIdentity[];
  searchable: boolean;
  languages: string[];
  preprocess: OcrPreprocessSettings;
}

/**
 * Identity for the exact scan settings that produced an output. It is not a
 * security checksum; it prevents a previously validated PDF from remaining
 * downloadable after the page order, rotation, OCR, or cleanup settings change.
 */
export function buildScanOutputFingerprint(recipe: ScanOutputRecipe): string {
  return JSON.stringify({
    pages: recipe.pages.map((page) => ({
      id: page.id,
      name: page.name,
      size: page.size,
      lastModified: page.lastModified,
      type: page.type,
      rotation: page.rotation
    })),
    searchable: recipe.searchable,
    languages: [...recipe.languages],
    preprocess: {
      grayscale: recipe.preprocess.grayscale,
      contrast: recipe.preprocess.contrast,
      brightness: recipe.preprocess.brightness,
      threshold: recipe.preprocess.threshold,
      invert: recipe.preprocess.invert,
      scale: recipe.preprocess.scale
    }
  });
}
