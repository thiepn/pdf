import { describe, expect, it } from "vitest";
import { batchStepLabel, defaultBatchStep, migrateBatchRecipe, normalizeBatchBlankPageCount } from "../../src/processing/batchModel";
import { mmToPt, normalizePagesPerSplit, resolveDecorationLanguage } from "../../src/toolbox/toolboxModel";
import { createStoredZip } from "../../src/toolbox/zip";

describe("Phase 18 toolbox model", () => {
  it("uses metric page inputs while preserving PDF point conversion", () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 8);
    expect(mmToPt(-1)).toBe(0);
  });

  it("bounds split and blank-page sizes", () => {
    expect(normalizePagesPerSplit(0)).toBe(1);
    expect(normalizePagesPerSplit(501)).toBe(500);
    expect(normalizeBatchBlankPageCount(99)).toBe(20);
  });

  it("selects CJK decoration fonts and rejects shaping-dependent scripts", () => {
    expect(resolveDecorationLanguage("한국어 문서")).toBe("ko");
    expect(resolveDecorationLanguage("日本語の文書")).toBe("ja");
    expect(resolveDecorationLanguage("中文文档")).toBe("zh-Hans");
    expect(resolveDecorationLanguage("中文文檔", "zh-Hant")).toBe("zh-Hant");
    expect(() => resolveDecorationLanguage("مرحبا بالعالم")).toThrow(/Complex-script decoration/);
  });

  it("builds and labels grayscale recipe nodes", () => {
    const step = defaultBatchStep("grayscale", "gray");
    expect(step).toEqual({ id: "gray", type: "grayscale", profile: "balanced" });
    expect(batchStepLabel(step)).toBe("Grayscale · balanced");
  });

  it("migrates v1 recipes without changing step order", () => {
    let index = 0;
    const recipe = migrateBatchRecipe({ schemaVersion: 1, id: "legacy", name: "Old", steps: [], outputSuffix: "done", updatedAt: 1, rotate: 180, compression: "screen", removeMetadata: true }, 99, () => `id-${++index}`);
    expect(recipe.steps.map((step) => step.type)).toEqual(["rotate", "raster-compress", "remove-metadata"]);
    expect(recipe.updatedAt).toBe(99);
  });

  it("writes a standards-shaped stored ZIP with UTF-8 names", () => {
    const zip = createStoredZip([{ name: "한국어.txt", bytes: new TextEncoder().encode("payload") }]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(zip.byteLength - 22, true)).toBe(0x06054b50);
    expect(new TextDecoder().decode(zip)).toContain("한국어.txt");
  });
});
