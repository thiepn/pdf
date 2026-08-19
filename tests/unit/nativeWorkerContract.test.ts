import { describe, expect, it } from "vitest";
import workerSource from "../../src/workers/native-editor.worker.ts?raw";

describe("native editor worker MuPDF contract", () => {
  it("uses MuPDF's Redact annotation enum for permanent existing-content replacement", () => {
    expect(workerSource).toContain('page.createAnnotation("Redact")');
    expect(workerSource).not.toContain('page.createAnnotation("Redaction")');
  });
});
