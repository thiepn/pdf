export const BATCH_RECIPE_SCHEMA_VERSION = 3;

export type BatchStep =
  | { id: string; type: "rotate"; degrees: 90 | 180 | 270 }
  | { id: string; type: "optimize" }
  | { id: string; type: "remove-metadata" }
  | { id: string; type: "crop"; topMm: number; rightMm: number; bottomMm: number; leftMm: number }
  | { id: string; type: "decorate"; watermarkText: string; headerText: string; footerText: string; pageNumbers: boolean; startNumber: number; fontLanguage?: "auto" | "ko" | "ja" | "zh-Hans" | "zh-Hant" }
  | { id: string; type: "blank-pages"; position: "start" | "end"; count: number; widthMm: number; heightMm: number }
  | { id: string; type: "raster-compress"; profile: "screen" | "balanced" | "small" | "print" }
  | { id: string; type: "grayscale"; profile: "screen" | "balanced" | "print" }
  | { id: string; type: "split-fixed"; pagesPerFile: number }
  | { id: string; type: "page-images"; quality: "compact" | "balanced" | "high" };

export interface BatchRecipe {
  schemaVersion: number;
  id: string;
  name: string;
  steps: BatchStep[];
  outputSuffix: string;
  updatedAt: number;
  /** Phase 1-17 legacy fields accepted only during migration. */
  rotate?: 0 | 90 | 180 | 270;
  compression?: "none" | "lossless" | "screen" | "balanced" | "small" | "print";
  removeMetadata?: boolean;
}
export type BatchItemStatus = "pending" | "running" | "complete" | "failed" | "cancelled";
