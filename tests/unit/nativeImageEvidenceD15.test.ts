import { describe, expect, it } from "vitest";
import { imageBoxDistance, imagePreservationBaseline } from "../../src/native/nativeImageEvidence";
import type { NativeRect } from "../../src/types/nativeEditor";

const rect = (x: number, y: number): NativeRect => ({ x, y, w: 70, h: 50 });

describe("D15 native image export evidence", () => {
  it("uses the same graphics-device image coordinate source before and after a masked transform", () => {
    const structured = [rect(390, 268), rect(478, 268)];
    const originalDevice = [rect(390, 474), rect(478, 474)];
    const afterDevice = [rect(402, 474), rect(478, 474)];
    const baseline = imagePreservationBaseline("masked", structured, originalDevice);
    expect(baseline).toEqual(originalDevice);
    expect(baseline).not.toEqual(structured);
    expect(imageBoxDistance(baseline[1], afterDevice[1])).toBe(0);
    expect(imageBoxDistance(baseline[0], afterDevice[0])).toBe(12);
  });

  it("does not substitute device coordinates for ordinary unmasked images", () => {
    const structured = [rect(390, 268)];
    expect(imagePreservationBaseline("plain", structured, [rect(390, 474)])).toBe(structured);
    expect(imagePreservationBaseline("shared", structured, [])).toBe(structured);
  });

  it("blocks masked mutations if independent device evidence is absent", () => {
    expect(() => imagePreservationBaseline("masked", [rect(390, 268)], [])).toThrow(/must remain unchanged/);
  });

  it("still rejects a genuinely moved or missing sibling instance", () => {
    const before = imagePreservationBaseline("masked", [], [rect(390, 474), rect(478, 474)]);
    const after = [rect(402, 474), rect(479, 480)];
    expect(after.some(candidate => imageBoxDistance(candidate, before[1]) <= 4)).toBe(false);
  });
});
