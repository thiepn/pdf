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


function overlapRatio(a: NativeRect, b: NativeRect): number {
  return Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) / Math.max(1, Math.min(a.h, b.h));
}

export function nativeTextSourceLines(object: NativeTextObject): Array<{ text: string; bounds: NativeRect }> {
  const source = object.lines ?? [];
  if (!source.length) return [{ text: object.text, bounds: { ...object.bounds } }];
  const groups: typeof source[] = [];
  const ordered = [...source].sort((left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x);
  for (const line of ordered) {
    const group = groups.find((items) => items.some((item) =>
      item.writingMode === line.writingMode
      && (line.writingMode === 1
        ? Math.max(0, Math.min(item.bounds.x + item.bounds.w, line.bounds.x + line.bounds.w) - Math.max(item.bounds.x, line.bounds.x)) / Math.max(1, Math.min(item.bounds.w, line.bounds.w)) >= 0.55
        : overlapRatio(item.bounds, line.bounds) >= 0.55 || Math.abs(item.bounds.y - line.bounds.y) <= Math.max(item.bounds.h, line.bounds.h) * 0.35)
    ));
    group ? group.push(line) : groups.push([line]);
  }
  return groups.map((items) => {
    const vertical = items.filter((item) => item.writingMode === 1).length > items.length / 2;
    const sorted = [...items].sort((left, right) => vertical ? left.bounds.y - right.bounds.y : left.bounds.x - right.bounds.x);
    let text = "";
    let previous = sorted[0];
    for (const item of sorted) {
      if (text && previous && !/\s$/u.test(text) && !/^\s/u.test(item.text)) {
        const gap = vertical
          ? item.bounds.y - (previous.bounds.y + previous.bounds.h)
          : item.bounds.x - (previous.bounds.x + previous.bounds.w);
        if (gap > Math.max(1.5, Math.min(previous.size, item.size) * 0.18)) text += " ";
      }
      text += item.text;
      previous = item;
    }
    const x = Math.min(...sorted.map((item) => item.bounds.x));
    const y = Math.min(...sorted.map((item) => item.bounds.y));
    const x1 = Math.max(...sorted.map((item) => item.bounds.x + item.bounds.w));
    const y1 = Math.max(...sorted.map((item) => item.bounds.y + item.bounds.h));
    return { text: text.trim(), bounds: { x, y, w: x1 - x, h: y1 - y } };
  }).sort((left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x);
}
