import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("native editor worker MuPDF contract", () => {
  it("uses MuPDF's Redact annotation enum for permanent existing-content replacement", () => {
    const source = readFileSync(new URL("../../src/workers/native-editor.worker.ts", import.meta.url), "utf8");
    expect(source).toContain('page.createAnnotation("Redact")');
    expect(source).not.toContain('page.createAnnotation("Redaction")');
  });
});
