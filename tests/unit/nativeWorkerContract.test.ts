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
});
