import { describe, expect, it } from "vitest";
import panelSource from "../../src/editor/native/LayoutAwareTextPropertiesPanel.tsx?raw";
import findReplaceSource from "../../src/editor/native/nativeFindReplace.ts?raw";
import unifiedSource from "../../src/editor/unifiedLayout.ts?raw";
import legacySource from "../../src/editor/native/LegacyNativeContentPropertiesPanel.tsx?raw";

describe("P1 exact source-span redaction wiring", () => {
  it("carries precise source rectangles through manual edits and reflow followers", () => {
    expect(panelSource).toContain("sourceRects: nativeTextSourceRects(source)");
    expect(panelSource).toContain("sourceRects: queued?.sourceRects ?? nativeTextSourceRects(object)");
  });

  it("carries precise source rectangles through find-and-replace and geometry operations", () => {
    expect(findReplaceSource).toContain("sourceRects: nativeTextSourceRects(object)");
    expect(unifiedSource).toContain("sourceRects: base.sourceRects ?? nativeTextSourceRects(object)");
    expect(unifiedSource).toContain("sourceRects: edit.sourceRects ?? nativeTextSourceRects(object)");
  });

  it("keeps the legacy native properties path on the same safety contract", () => {
    expect(legacySource).toContain("sourceRects: queued?.sourceRects ?? nativeTextSourceRects(object)");
  });
});
