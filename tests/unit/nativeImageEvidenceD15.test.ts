import { describe, expect, it } from "vitest";
import { imageBoxDistance, imagePreservationBaseline, requirePreservedImageSiblings, matchRenderedMaskedInvocations } from "../../src/native/nativeImageEvidence";
import type { NativeRect } from "../../src/types/nativeEditor";

const rect = (x: number, y: number): NativeRect => ({ x, y, w: 70, h: 50 });

describe("D18 image XObject-to-rendered paint correspondence", () => {
  const masked = (x: number, y: number, overrides = {}) => ({
    resourceName: "ImSoft", bounds: rect(x, y),
    softMask: true, explicitMask: false, clipped: false, blendMode: "Normal", ...overrides
  });

  it("matches two distinct shared masked XObject invocations regardless of display order", () => {
    const positions = [rect(478, 474), rect(22, 170), rect(390, 474), rect(386, 350)];
    const mapped = matchRenderedMaskedInvocations([masked(390, 474), masked(478, 474)], positions);
    expect([...mapped.keys()].sort((a, b) => a - b)).toEqual([0, 2]);
    expect(mapped.get(0)?.resourceName).toBe("ImSoft");
    expect(mapped.get(2)?.softMask).toBe(true);
  });

  it("refuses a Do invocation with no real rendered image", () => {
    expect(matchRenderedMaskedInvocations([masked(390, 474)], [rect(90, 80)])).toHaveProperty("size", 0);
  });

  it("refuses ambiguous two-to-one source and display positions", () => {
    const map = matchRenderedMaskedInvocations([masked(390, 474), masked(390, 474)], [rect(390, 474)]);
    expect(map.size).toBe(0);
    const alsoAmbiguous = matchRenderedMaskedInvocations([masked(390, 474)], [rect(390, 474), rect(390, 474)]);
    expect(alsoAmbiguous.size).toBe(0);
  });

  it("protects clipped, blended, explicit-mask and missing-mask source states", () => {
    for (const overrides of [
      { clipped: true }, { blendMode: "Multiply" },
      { explicitMask: true }, { softMask: false }
    ]) {
      expect(matchRenderedMaskedInvocations([masked(390, 474, overrides)], [rect(390, 474)]).size).toBe(0);
    }
  });

  it("refuses missing and invalid CTM tolerance instead of broadening matching", () => {
    expect(matchRenderedMaskedInvocations([masked(390, 474)], [rect(401, 474)]).size).toBe(0);
    expect(() => matchRenderedMaskedInvocations([], [], -1)).toThrow(/nonnegative/);
    expect(() => matchRenderedMaskedInvocations([], [], Number.NaN)).toThrow(/nonnegative/);
  });
});

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

  it("preserves two distinct masked images and plain siblings in a real source-transform inventory", () => {
    const original = [
      { bounds: rect(390, 474), masked: true },
      { bounds: rect(478, 474), masked: true },
      { bounds: rect(30, 230), masked: false },
      { bounds: rect(140, 230), masked: false }
    ];
    const after = [
      { bounds: rect(402, 474), masked: true },
      { bounds: rect(478, 474), masked: true },
      original[2],
      original[3]
    ];
    expect(() => requirePreservedImageSiblings(original, after, original[0].bounds, after[0].bounds)).not.toThrow();
  });

  it("rejects one output mask being reused to satisfy multiple overlapping sibling images", () => {
    const selected = { bounds: rect(390, 474), masked: true };
    const sibling = { bounds: rect(478, 474), masked: true };
    const original = [selected, sibling, { ...sibling }];
    const after = [
      { bounds: rect(402, 474), masked: true },
      sibling,
      { bounds: rect(90, 70), masked: true }
    ];
    expect(() => requirePreservedImageSiblings(original, after, selected.bounds, after[0].bounds)).toThrow(/untouched image instance/);
  });

  it("does not count the moved target as a second untouched sibling", () => {
    const selected = { bounds: rect(390, 474), masked: true };
    const sibling = { bounds: rect(478, 474), masked: true };
    const originals = [selected, sibling];
    const after = [
      { bounds: rect(478, 474), masked: true },
      { bounds: rect(70, 190), masked: true }
    ];
    expect(() => requirePreservedImageSiblings(originals, after, selected.bounds, rect(478, 474)))
      .toThrow(/untouched image instance/);
  });

  it("does not accept a rendered image whose original attached soft mask has been dropped", () => {
    const selected = { bounds: rect(390, 474), masked: true };
    const sibling = { bounds: rect(478, 474), masked: true };
    expect(() => requirePreservedImageSiblings(
      [selected, sibling],
      [{ bounds: rect(402, 474), masked: false }, sibling],
      selected.bounds, rect(402, 474)
    )).toThrow(/soft masks disappeared/);
  });

  it("blocks a missing image even when surviving PDF paints still have intact mask metadata", () => {
    const selected = { bounds: rect(390, 474), masked: true };
    const sibling = { bounds: rect(478, 474), masked: true };
    expect(() => requirePreservedImageSiblings(
      [selected, sibling, { bounds: rect(30, 230), masked: false }],
      [{ bounds: rect(402, 474), masked: true }, sibling],
      selected.bounds, rect(402, 474)
    )).toThrow(/rendered instances/);
  });

  it("still rejects a genuinely moved or missing sibling instance", () => {
    const before = imagePreservationBaseline("masked", [], [rect(390, 474), rect(478, 474)]);
    const after = [rect(402, 474), rect(479, 480)];
    expect(after.some(candidate => imageBoxDistance(candidate, before[1]) <= 4)).toBe(false);
  });
});
