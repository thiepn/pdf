import { describe, expect, it } from "vitest";
import workerSource from "../../src/workers/native-editor.worker.ts?raw";

describe("native editor worker MuPDF contract", () => {
  it("uses MuPDF's Redact annotation enum for permanent existing-content replacement", () => {
    expect(workerSource).toContain('page.createAnnotation("Redact")');
    expect(workerSource).not.toContain('page.createAnnotation("Redaction")');
  });

  it("redacts original text geometry before writing P2 expanded destinations", () => {
    expect(workerSource).toContain("redactRegion(page, (edit as any).sourceBounds ?? edit.bounds)");
    expect(workerSource).toContain("prevents a follower's old redaction rectangle");
  });

  it("supports measured source style runs and explicitly imported Latin fonts", () => {
    expect(workerSource).toContain("Array.isArray(edit.styleRuns)");
    expect(workerSource).toContain('edit.fontSource === "imported-latin"');
    expect(workerSource).toContain("font.font.advanceGlyph");
    expect(workerSource).toContain("wrapStyled");
  });

  it("distinguishes MuPDF PDF null objects from concrete dictionaries and streams", () => {
    expect(workerSource).toContain('let root = object.get("Resources")');
    expect(workerSource).toContain("if (!root?.isDictionary?.())");
    expect(workerSource).toContain('const inherited = object.getInheritable?.("Resources")');
    expect(workerSource).toContain("inherited?.isDictionary?.() ? pdf.graftObject(inherited) : pdf.newDictionary()");
    expect(workerSource).toContain("if (!dictionary?.isDictionary?.())");
    expect(workerSource).toContain("if (!current || current.isNull?.())");
    expect(workerSource).not.toContain("if (!root) {");
    expect(workerSource).not.toContain("if (!dictionary) {");
  });
});
