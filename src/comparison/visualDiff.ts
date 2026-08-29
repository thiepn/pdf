export const DEFAULT_VISUAL_DIFF_MAX_PIXELS = 2_000_000;
export const DEFAULT_VISUAL_DIFF_MAX_EDGE = 4_096;
export const DEFAULT_VISUAL_DIFF_THRESHOLD = 45;

export interface RgbaPlane {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface VisualDiffPixels {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  changedRatio: number;
}

export function boundedPairScale(
  left: { width: number; height: number } | null,
  right: { width: number; height: number } | null,
  maxPixels = DEFAULT_VISUAL_DIFF_MAX_PIXELS,
  maxEdge = DEFAULT_VISUAL_DIFF_MAX_EDGE
): number {
  const widths = [left?.width ?? 0, right?.width ?? 0].filter((value) => Number.isFinite(value) && value > 0);
  const heights = [left?.height ?? 0, right?.height ?? 0].filter((value) => Number.isFinite(value) && value > 0);
  if (!widths.length || !heights.length) return 1;

  const width = Math.max(...widths);
  const height = Math.max(...heights);
  const area = width * height;
  const pixelScale = area > maxPixels ? Math.sqrt(maxPixels / area) : 1;
  const edgeScale = Math.min(maxEdge / width, maxEdge / height, 1);
  return Math.max(0.01, Math.min(1, pixelScale, edgeScale));
}

export function diffRgbaPlanes(
  left: RgbaPlane,
  right: RgbaPlane,
  threshold = DEFAULT_VISUAL_DIFF_THRESHOLD
): VisualDiffPixels {
  validatePlane(left, "left");
  validatePlane(right, "right");
  const width = Math.max(left.width, right.width);
  const height = Math.max(left.height, right.height);
  const output = new Uint8ClampedArray(width * height * 4);
  let changed = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const outputIndex = (y * width + x) * 4;
      const leftIndex = x < left.width && y < left.height ? (y * left.width + x) * 4 : -1;
      const rightIndex = x < right.width && y < right.height ? (y * right.width + x) * 4 : -1;
      const leftR = leftIndex >= 0 ? left.pixels[leftIndex] : 255;
      const leftG = leftIndex >= 0 ? left.pixels[leftIndex + 1] : 255;
      const leftB = leftIndex >= 0 ? left.pixels[leftIndex + 2] : 255;
      const rightR = rightIndex >= 0 ? right.pixels[rightIndex] : 255;
      const rightG = rightIndex >= 0 ? right.pixels[rightIndex + 1] : 255;
      const rightB = rightIndex >= 0 ? right.pixels[rightIndex + 2] : 255;
      const difference = Math.abs(leftR - rightR) + Math.abs(leftG - rightG) + Math.abs(leftB - rightB);

      if (difference > threshold) {
        changed += 1;
        output[outputIndex] = 220;
        output[outputIndex + 1] = 50;
        output[outputIndex + 2] = 50;
        output[outputIndex + 3] = Math.min(255, Math.round(80 + difference / 3));
      } else {
        output[outputIndex] = 245;
        output[outputIndex + 1] = 245;
        output[outputIndex + 2] = 245;
        output[outputIndex + 3] = 80;
      }
    }
  }

  return {
    width,
    height,
    pixels: output,
    changedRatio: width && height ? changed / (width * height) : 0
  };
}

function validatePlane(plane: RgbaPlane, side: string): void {
  if (!Number.isSafeInteger(plane.width) || !Number.isSafeInteger(plane.height) || plane.width <= 0 || plane.height <= 0) {
    throw new Error(`Invalid ${side} comparison dimensions.`);
  }
  if (plane.pixels.length !== plane.width * plane.height * 4) {
    throw new Error(`Invalid ${side} comparison pixel buffer.`);
  }
}
