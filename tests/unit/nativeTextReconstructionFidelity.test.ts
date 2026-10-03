import { describe, expect, it } from "vitest";
import workerSource from "../../src/workers/native-editor.worker.ts?raw";
import panelSource from "../../src/editor/native/LayoutAwareTextPropertiesPanel.tsx?raw";
import findReplaceSource from "../../src/editor/native/nativeFindReplace.ts?raw";

describe("P1 native text reconstruction fidelity", () => {
  it("preserves image and vector content while removing replaced source text", () => {
    expect(workerSource).toContain("function redactTextOnly");
    expect(workerSource).toContain("PDFPage.REDACT_IMAGE_NONE");
    expect(workerSource).toContain("PDFPage.REDACT_LINE_ART_NONE");
    expect(workerSource).toContain("function textSourceRegions");
    expect(workerSource).toContain("Array.isArray(edit.sourceRects)");
    expect(workerSource).toContain("redactTextOnly(page, textSourceRegions(edit))");
  });

  it("uses transparent replacement backgrounds unless the user explicitly asks for a fill", () => {
    expect(workerSource).toContain('backgroundColor: (edit as any).backgroundColor ?? "transparent"');
    expect(panelSource).toContain('const queuedBackground = queued?.backgroundColor ?? "transparent"');
    expect(panelSource).toContain('backgroundColor: fillBackground ? background : "transparent"');
    expect(findReplaceSource).toContain('backgroundColor: "transparent"');
  });

  it("keeps an explicit solid-background control for documents that need it", () => {
    expect(panelSource).toContain("Paint a solid background behind replacement text");
    expect(panelSource).toContain("Background fill is off by default");
  });
});
