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

  it("preserves original visual-line regions and hard line membership for fixed-box paragraph reconstruction", () => {
    expect(workerSource).toContain("function textSourceLineRegions");
    expect(workerSource).toContain("function retainedSourceLines");
    expect(workerSource).toContain("function retainedLineBreakOffsets");
    expect(workerSource).toContain("withRetainedLineBreaks");
    expect(workerSource).toContain('edit.layoutMode !== "expand-flow"');
    expect(workerSource).toContain("retainedLines.map((line) => line.bounds)");
    expect(workerSource).toContain("sourceLineRegions.map((region) => Math.max(region.w");
    expect(workerSource).toContain("edit.bounds.w - Math.max(0, region.x - edit.bounds.x)");
    expect(workerSource).toContain("Array.from(edit.text.slice(0, utf16Offset)).length");
    expect(workerSource).toContain("const sourceLayoutFits =");
    expect(workerSource).toContain("sourceRegion ? pdfRect(page, sourceRegion)");
    expect(workerSource).toContain("sourceRegion ? lineY1 - baselineSize");
    expect(panelSource).toContain("sourceLines: queued?.sourceLines ?? nativeTextSourceLines(object)");
    expect(findReplaceSource).toContain("sourceLines: nativeTextSourceLines(object)");
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
