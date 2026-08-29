import { describe, expect, it } from "vitest";
import { boundedPairScale, diffRgbaPlanes } from "../../src/comparison/visualDiff";

function plane(width: number, height: number, rgb: [number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = rgb[0];
    pixels[index + 1] = rgb[1];
    pixels[index + 2] = rgb[2];
    pixels[index + 3] = 255;
  }
  return { width, height, pixels };
}

describe("visual diff safety", () => {
  it("reports identical planes without changed pixels", () => {
    const result = diffRgbaPlanes(plane(3, 2, [255, 255, 255]), plane(3, 2, [255, 255, 255]));
    expect(result.changedRatio).toBe(0);
    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
  });

  it("counts materially different pixels", () => {
    const left = plane(2, 1, [255, 255, 255]);
    const right = plane(2, 1, [255, 255, 255]);
    right.pixels[0] = 0;
    right.pixels[1] = 0;
    right.pixels[2] = 0;
    const result = diffRgbaPlanes(left, right);
    expect(result.changedRatio).toBe(0.5);
    expect(Array.from(result.pixels.slice(0, 4))).toEqual([220, 50, 50, 255]);
  });

  it("treats missing page area as white instead of allocating padded source planes", () => {
    const result = diffRgbaPlanes(plane(1, 1, [0, 0, 0]), plane(2, 1, [255, 255, 255]));
    expect(result.width).toBe(2);
    expect(result.changedRatio).toBe(0.5);
  });

  it("caps pair rendering by both pixel budget and maximum edge", () => {
    const byPixels = boundedPairScale({ width: 10_000, height: 10_000 }, { width: 8_000, height: 8_000 }, 2_000_000, 4_096);
    expect(byPixels).toBeCloseTo(Math.sqrt(2_000_000 / 100_000_000), 6);

    const byEdge = boundedPairScale({ width: 20_000, height: 100 }, null, 10_000_000, 4_096);
    expect(byEdge).toBeCloseTo(4_096 / 20_000, 6);
  });

  it("rejects malformed pixel buffers before diffing", () => {
    expect(() => diffRgbaPlanes({ width: 2, height: 2, pixels: new Uint8ClampedArray(3) }, plane(2, 2, [255, 255, 255]))).toThrow(/pixel buffer/i);
  });
});
