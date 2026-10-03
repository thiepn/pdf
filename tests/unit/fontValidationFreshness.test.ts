import { describe, expect, it } from "vitest";
import panelSource from "../../src/editor/native/LayoutAwareTextPropertiesPanel.tsx?raw";
import workerSource from "../../src/workers/font-validation.worker.ts?raw";

describe("P1 imported-font validation freshness", () => {
  it("keys an accepted font to the exact current text and font identity", () => {
    expect(panelSource).toContain("fontValidation.validatedText === text");
    expect(panelSource).toContain("fontValidation.validatedFontName === fontName");
    expect(panelSource).toContain("const importedFontReady = !fontBytes?.byteLength");
    expect(panelSource).toContain("|| !importedFontReady");
  });

  it("revalidates the accepted font after later text edits", () => {
    expect(panelSource).toContain('validateImportedFont(fontBytes, fontName || "Imported Font", text');
    expect(panelSource).toContain("[fontBytes, fontName, text]");
    expect(panelSource).toContain("This font no longer covers every character in the current text");
  });

  it("checks usable glyph metrics in addition to glyph presence", () => {
    expect(workerSource).toContain("font.advanceGlyph(glyph, 0)");
    expect(workerSource).toContain("invalid glyph metrics");
  });
});
