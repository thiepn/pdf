import { describe, expect, it } from "vitest";
import workerSource from "../../src/workers/native-editor.worker.ts?raw";

describe("native editor worker MuPDF contract", () => {
  it("uses MuPDF's Redact annotation enum for permanent existing-content replacement", () => {
    expect(workerSource).toContain('page.createAnnotation("Redact")');
    expect(workerSource).not.toContain('page.createAnnotation("Redaction")');
  });

  it("redacts only exact source text regions before writing expanded destinations", () => {
    expect(workerSource).toContain("function textSourceRegions");
    expect(workerSource).toContain("Array.isArray(edit.sourceRects)");
    expect(workerSource).toContain("redactTextOnly(page, textSourceRegions(edit))");
    expect(workerSource).toContain("REDACT_IMAGE_NONE");
    expect(workerSource).toContain("REDACT_LINE_ART_NONE");
    expect(workerSource).toContain("REDACT_TEXT_REMOVE");
    expect(workerSource).toContain("prevents a follower's old redaction rectangle");
  });

  it("supports measured source style runs and explicitly imported Latin fonts", () => {
    expect(workerSource).toContain("Array.isArray(edit.styleRuns)");
    expect(workerSource).toContain('edit.fontSource === "imported-latin"');
    expect(workerSource).toContain("font.font.advanceGlyph");
    expect(workerSource).toContain("wrapStyled");
    expect(workerSource).toContain('import { encodeWinAnsiHex } from "../native/textEncoding"');
    expect(workerSource).not.toContain("const winAnsiExtras = new Map");
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
