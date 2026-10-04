import type { NativeRect, NativeTextEditRun } from "../types/nativeEditor";
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
  maxLineWidth: number;
}

export function fitsWithinSourceBaseline(candidate: NativeTextFitResult, source: NativeTextFitResult, tolerance = 0.5): boolean {
  if (candidate.fits) return true;
  if (source.fits) return false;
  return candidate.lineCount <= source.lineCount
    && candidate.requiredHeight <= source.requiredHeight + tolerance
    && candidate.maxLineWidth <= source.maxLineWidth + tolerance;
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
  const maxLines = Math.max(1, Math.floor(bounds.h / lineHeight));
  const lines = wrap ? wrapTextToBox(text, bounds.w, safeSize) : text.replace(/\r\n?/g, "\n").split("\n");
  const lineWidths = lines.map((line) => estimatedTextWidth(line, safeSize));
  const maxLineWidth = Math.max(0, ...lineWidths);
  const widthOverflow = !wrap && maxLineWidth > Math.max(1, bounds.w - 3);
  const requiredHeight = Math.max(lineHeight, lines.length * lineHeight);
  const heightOverflow = lines.length > maxLines;
  return {
    lines,
    lineCount: lines.length,
    maxLines,
    widthOverflow,
    heightOverflow,
    fits: !widthOverflow && !heightOverflow,
    fontSize: safeSize,
    lineHeight,
    requiredHeight,
    maxLineWidth
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


interface StyledFitChar {
  char: string;
  width: number;
}

interface StyledFitLine {
  chars: StyledFitChar[];
  width: number;
}

function styledCharacters(runs: readonly NativeTextEditRun[]): StyledFitChar[] {
  return runs.flatMap((run) => [...run.text].map((char) => ({
    char,
    width: char === "\n" ? 0 : estimatedTextWidth(char, Math.max(1, run.fontSize))
  })));
}

function styledLine(chars: StyledFitChar[]): StyledFitLine {
  let end = chars.length;
  while (end > 0 && chars[end - 1].char !== "\n" && /\s/u.test(chars[end - 1].char)) end -= 1;
  const clean = chars.slice(0, end);
  return { chars: clean, width: clean.reduce((sum, item) => sum + item.width, 0) };
}

function trimStyledLeadingWhitespace(chars: StyledFitChar[]): StyledFitChar[] {
  let start = 0;
  while (start < chars.length && chars[start].char !== "\n" && /\s/u.test(chars[start].char)) start += 1;
  return chars.slice(start);
}

function wrapStyledCharacters(chars: StyledFitChar[], width: number, wrap: boolean): StyledFitLine[] {
  const safeWidth = Math.max(1, width - 3);
  const lines: StyledFitLine[] = [];
  let current: StyledFitChar[] = [];
  let currentWidth = 0;
  const flush = () => {
    lines.push(styledLine(current));
    current = [];
    currentWidth = 0;
  };

  for (const item of chars) {
    if (item.char === "\n") { flush(); continue; }
    if (!wrap) {
      current.push(item);
      currentWidth += item.width;
      continue;
    }
    if (current.length && currentWidth + item.width > safeWidth) {
      let breakIndex = -1;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (/\s/u.test(current[index].char)) { breakIndex = index; break; }
      }
      if (breakIndex >= 0) {
        const before = current.slice(0, breakIndex);
        const remainder = trimStyledLeadingWhitespace(current.slice(breakIndex + 1));
        lines.push(styledLine(before));
        current = remainder;
        currentWidth = current.reduce((sum, value) => sum + value.width, 0);
      } else flush();
    }
    if (!current.length && /\s/u.test(item.char)) continue;
    current.push(item);
    currentWidth += item.width;
    if (wrap && currentWidth > safeWidth && current.length === 1) flush();
  }
  if (current.length || !lines.length) lines.push(styledLine(current));
  return lines;
}

/**
 * Mirrors the export worker's mixed-style wrapping structure while using the
 * deterministic browser-side width estimator. Unlike evaluateTextFit, this does
 * not pretend every character uses the paragraph's largest font size.
 */
export function evaluateStyledTextFit(
  runs: readonly NativeTextEditRun[],
  bounds: NativeRect,
  wrap: boolean,
  sourceLineHeight?: number
): NativeTextFitResult {
  const safeRuns = runs.length ? runs : [];
  const maximumSize = Math.max(1, ...safeRuns.map((run) => Math.max(1, run.fontSize)));
  const lineHeight = Math.max(maximumSize, sourceLineHeight && Number.isFinite(sourceLineHeight) ? sourceLineHeight : maximumSize * 1.2);
  const wrapped = wrapStyledCharacters(styledCharacters(safeRuns), bounds.w, wrap);
  const lines = wrapped.map((line) => line.chars.map((item) => item.char).join(""));
  const maxLines = Math.max(1, Math.floor(bounds.h / lineHeight));
  const maxLineWidth = Math.max(0, ...wrapped.map((line) => line.width));
  const widthOverflow = !wrap && maxLineWidth > Math.max(1, bounds.w - 3);
  const requiredHeight = Math.max(lineHeight, wrapped.length * lineHeight);
  const heightOverflow = wrapped.length > maxLines;
  return {
    lines,
    lineCount: wrapped.length,
    maxLines,
    widthOverflow,
    heightOverflow,
    fits: !widthOverflow && !heightOverflow,
    fontSize: maximumSize,
    lineHeight,
    requiredHeight,
    maxLineWidth
  };
}
