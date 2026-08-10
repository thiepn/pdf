import { describe, expect, it } from "vitest";
import { buildOcrRecipeFingerprint } from "../../src/ocr/recipe";

const base = {
  pageNumbers: [1, 2, 3],
  languages: ["eng"],
  preprocess: { grayscale: true, contrast: 1, brightness: 0, threshold: null, invert: false, scale: 2 }
};

describe("OCR recipe fingerprint", () => {
  it("is stable for the same resumable recipe", () => {
    expect(buildOcrRecipeFingerprint(base)).toBe(buildOcrRecipeFingerprint({ ...base, pageNumbers: [...base.pageNumbers] }));
  });

  it("changes when preprocessing changes", () => {
    const changed = { ...base, preprocess: { ...base.preprocess, contrast: 1.25 } };
    expect(buildOcrRecipeFingerprint(changed)).not.toBe(buildOcrRecipeFingerprint(base));
  });

  it("changes when language or selected pages change", () => {
    expect(buildOcrRecipeFingerprint({ ...base, languages: ["deu"] })).not.toBe(buildOcrRecipeFingerprint(base));
    expect(buildOcrRecipeFingerprint({ ...base, pageNumbers: [1, 2] })).not.toBe(buildOcrRecipeFingerprint(base));
  });
});
