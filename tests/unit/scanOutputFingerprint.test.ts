import { describe, expect, it } from "vitest";
import { buildScanOutputFingerprint, type ScanOutputRecipe } from "../../src/scan/scanOutputFingerprint";

const base: ScanOutputRecipe = {
  pages: [
    { id: "a", name: "a.png", size: 100, lastModified: 1, type: "image/png", rotation: 0 },
    { id: "b", name: "b.png", size: 200, lastModified: 2, type: "image/png", rotation: 0 }
  ],
  searchable: false,
  languages: [],
  preprocess: { grayscale: false, contrast: 1, brightness: 0, threshold: null, invert: false, scale: 1 }
};

describe("scan output fingerprint", () => {
  it("is stable for the same exact scan recipe", () => {
    expect(buildScanOutputFingerprint(base)).toBe(buildScanOutputFingerprint(structuredClone(base)));
  });

  it("changes when page order or rotation changes", () => {
    const reordered = structuredClone(base);
    reordered.pages.reverse();
    const rotated = structuredClone(base);
    rotated.pages[0].rotation = 90;

    expect(buildScanOutputFingerprint(reordered)).not.toBe(buildScanOutputFingerprint(base));
    expect(buildScanOutputFingerprint(rotated)).not.toBe(buildScanOutputFingerprint(base));
  });

  it("changes when OCR or cleanup settings change", () => {
    const searchable = structuredClone(base);
    searchable.searchable = true;
    searchable.languages = ["eng"];
    const cleaned = structuredClone(base);
    cleaned.preprocess.grayscale = true;
    cleaned.preprocess.contrast = 1.25;

    expect(buildScanOutputFingerprint(searchable)).not.toBe(buildScanOutputFingerprint(base));
    expect(buildScanOutputFingerprint(cleaned)).not.toBe(buildScanOutputFingerprint(base));
  });
});
