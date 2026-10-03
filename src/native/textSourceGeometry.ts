import type { NativeRect, NativeTextObject } from "../types/nativeEditor";

function validRect(rect: NativeRect | undefined): rect is NativeRect {
  return Boolean(rect)
    && Number.isFinite(rect!.x)
    && Number.isFinite(rect!.y)
    && Number.isFinite(rect!.w)
    && Number.isFinite(rect!.h)
    && rect!.w > 0
    && rect!.h > 0;
}

/**
 * Preserve the original source-span geometry when paragraph reconstruction
 * retained it. Destination movement/reflow must never move these rectangles:
 * they identify where the original glyphs still live in the source PDF.
 */
export function nativeTextSourceRects(object: NativeTextObject): NativeRect[] {
  const precise = (object.lines ?? [])
    .map((line) => line.bounds)
    .filter(validRect)
    .map((rect) => ({ ...rect }));
  return precise.length ? precise : [{ ...object.bounds }];
}
