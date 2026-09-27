/** Everyday operations use temporary files, not persistent project workspaces. */
export const quickTaskIds = [
  "merge-pdfs", "split-pdf", "extract-pages", "remove-pages", "rotate-pdf",
  "pdf-to-jpg", "pdf-to-png", "pdf-to-text", "images-to-pdf", "compress-pdf",
  "unlock-pdf", "password-protect", "add-page-numbers", "add-watermark", "crop-pages"
] as const;
export type QuickTaskId = typeof quickTaskIds[number];
export function isQuickTask(id: string): id is QuickTaskId {
  return (quickTaskIds as readonly string[]).includes(id);
}

export const MAX_INPUT_BYTES = 200 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
export const MAX_CANVAS_PIXELS = 24_000_000;

/** 1-based input -> zero-based indices; preserve requested order, deduplicate. */
export function parsePageSelection(value: string, pageCount: number): number[] {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw new Error("This PDF has no pages.");
  const normalized = value.trim().toLowerCase().replace(/[–—]/g, "-");
  if (!normalized) throw new Error("Choose pages, for example 1-3, 5, 8-end.");
  const result = new Set<number>();
  const endpoint = (text: string): number => {
    const number = /^(end|last)$/.test(text) ? pageCount : /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isSafeInteger(number) || number < 1 || number > pageCount) {
      throw new Error(`Page “${text}” is not valid. Use pages 1–${pageCount}.`);
    }
    return number;
  };
  for (const token of normalized.split(",").map((part) => part.trim())) {
    if (["all", "odd", "even"].includes(token)) {
      for (let page = 1; page <= pageCount; page++) {
        if (token === "all" || page % 2 === (token === "odd" ? 1 : 0)) result.add(page - 1);
      }
      continue;
    }
    const range = token.match(/^(\d+|end|last)\s*-\s*(\d+|end|last)$/);
    if (!range) { result.add(endpoint(token) - 1); continue; }
    const start = endpoint(range[1]); const end = endpoint(range[2]);
    const step = start <= end ? 1 : -1;
    for (let page = start; ; page += step) { result.add(page - 1); if (page === end) break; }
  }
  if (!result.size) throw new Error("No pages match this selection.");
  return [...result];
}

export type SplitMode = "each" | "every" | "ranges";
export function planSplit(pageCount: number, mode: SplitMode, every: number, ranges: string): number[][] {
  if (mode === "ranges") {
    if (!ranges.trim()) throw new Error("Enter groups separated by semicolons, for example 1-3; 4-6; 7-end.");
    return ranges.split(";").map((group) => parsePageSelection(group, pageCount));
  }
  const size = mode === "each" ? 1 : every;
  if (!Number.isSafeInteger(size) || size < 1) throw new Error("Pages per file must be a whole number of at least 1.");
  const pages = parsePageSelection("all", pageCount);
  return Array.from({ length: Math.ceil(pages.length / size) }, (_, index) => pages.slice(index * size, (index + 1) * size));
}

export function safeOutputName(value: string, extension: string): string {
  const base = value.trim().replace(/[\x00-\x1f<>:"/\\|?*]/g, "-").replace(/\.(pdf|zip|txt|jpe?g|png)$/i, "").replace(/[. ]+$/, "").slice(0, 140) || "document";
  return `${base}.${extension}`;
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export interface QuickOptions {
  selection: string;
  splitMode: SplitMode;
  every: number;
  ranges: string;
  rotation: 90 | 180 | 270;
  dpi: number;
  paper: "original" | "a4" | "letter";
  orientation: "auto" | "portrait" | "landscape";
  margin: number;
  compression: "lossless" | "balanced" | "small";
  acceptRaster: boolean;
  outputPassword: string;
  confirmPassword: string;
  watermark: string;
  startNumber: number;
  crop: { top: number; right: number; bottom: number; left: number };
}
export function defaultQuickOptions(): QuickOptions {
  return { selection: "all", splitMode: "each", every: 2, ranges: "", rotation: 90, dpi: 150, paper: "a4", orientation: "auto", margin: 10, compression: "lossless", acceptRaster: false, outputPassword: "", confirmPassword: "", watermark: "", startNumber: 1, crop: { top: 0, right: 0, bottom: 0, left: 0 } };
}

// One-use, in-memory hand-off. Never persisted to storage or sent over a network.
let handoff: { taskId: string; file: File } | null = null;
export function handOffQuickResult(taskId: string, file: File): void { handoff = { taskId, file }; }
export function takeQuickResult(taskId: string): File | null {
  if (handoff?.taskId !== taskId) { handoff = null; return null; }
  const file = handoff.file; handoff = null; return file;
}
