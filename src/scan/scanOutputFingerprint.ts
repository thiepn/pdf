import type { OcrPreprocessSettings } from "../types/ocr";

export interface ScanOutputFingerprintItem {
  id: string;
  file: Pick<File, "name" | "size" | "lastModified" | "type">;
  rotation: number;
}

/**
 * Captures every input that can change Scan-to-PDF bytes. Generated output is
 * valid only while this exact recipe remains current.
 */
export function buildScanOutputFingerprint(
  items: readonly ScanOutputFingerprintItem[],
  searchable: boolean,
  languages: readonly string[],
  preprocess: OcrPreprocessSettings
): string {
  return JSON.stringify({
    schema: 1,
    items: items.map((item) => ({
      id: item.id,
      name: item.file.name,
      size: item.file.size,
      lastModified: item.file.lastModified,
      type: item.file.type,
      rotation: ((item.rotation % 360) + 360) % 360
    })),
    searchable,
    languages: [...languages],
    preprocess: {
      grayscale: preprocess.grayscale,
      contrast: preprocess.contrast,
      brightness: preprocess.brightness,
      threshold: preprocess.threshold,
      invert: preprocess.invert,
      scale: preprocess.scale
    }
  });
}
