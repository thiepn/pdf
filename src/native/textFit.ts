import type { NativeRect } from "../types/nativeEditor";
import { estimatedTextWidth, wrapTextToBox } from "./nativeModel";

export interface NativeTextFitResult {
  lines: string[];
  lineCount: number;
  maxLines: number;
  widthOverflow: boolean;
  heightOverflow: boolean;
  fits: boolean;
  fontSize: number;
  lineHeight: number;
  requiredHeight: number;
}

/**
 * Mirrors the native export worker's text-box constraints so overflow is shown
 * before an edit is queued. This function does not mutate content or silently
 * truncate it. P2 can supply the source paragraph line advance rather than
 * assuming a fixed 1.2 multiplier.
 */
export function evaluateTextFit(text: string, bounds: NativeRect, fontSize: number, wrap: boolean, sourceLineHeight?: number): NativeTextFitResult {
  const safeSize = Math.max(1, fontSize);
  const lineHeight = Math.max(safeSize, sourceLineHeight && Number.isFinite(sourceLineHeight) ? sourceLineHeight : safeSize * 1.2);
  const maxLines = Math.max(1, Math.floor((bounds.h - 4) / lineHeight));
  const lines = wrap ? wrapTextToBox(text, bounds.w, safeSize) : text.replace(/\r\n?/g, "\n").split("\n");
  const widthOverflow = !wrap && lines.some((line) => estimatedTextWidth(line, safeSize) > Math.max(1, bounds.w - 3));
  const requiredHeight = Math.max(lineHeight + 4, lines.length * lineHeight + 4);
  const heightOverflow = requiredHeight > bounds.h + 0.01;
  return {
    lines,
    lineCount: lines.length,
    maxLines,
    widthOverflow,
    heightOverflow,
    fits: !widthOverflow && !heightOverflow,
    fontSize: safeSize,
    lineHeight,
    requiredHeight
  };
}

/**
 * Finds the largest quarter-point size at or below the requested size that
 * keeps the complete replacement inside the detected paragraph box. Returning
 * null is preferable to silently dropping text when even the minimum is too
 * large.
 */
export function findFittingFontSize(text: string, bounds: NativeRect, requestedSize: number, wrap: boolean, minimumSize = 4): number | null {
  const start = Math.max(minimumSize, requestedSize);
  for (let size = Math.round(start * 4) / 4; size >= minimumSize; size = Math.round((size - 0.25) * 4) / 4) {
    if (evaluateTextFit(text, bounds, size, wrap).fits) return size;
  }
  return null;
}
