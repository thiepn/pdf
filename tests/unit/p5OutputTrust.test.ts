import { describe, expect, it } from "vitest";
import { verifyOutputTrust } from "../../src/trust/outputVerification";
import quickSource from "../../src/views/QuickToolPage.tsx?raw";
import editorSource from "../../src/views/EditorPage.tsx?raw";
import organizerSource from "../../src/views/OrganizerPage.tsx?raw";
import ocrSource from "../../src/views/OcrPage.tsx?raw";
import databaseSource from "../../src/storage/database.ts?raw";
import releaseSource from "../../src/core/release.ts?raw";

describe("P5 trust and output verification", () => {
  it("marks non-PDF conversion as intentionally lossy and structurally not checked", async () => {
    const report = await verifyOutputTrust({
      operationId: "pdf-to-text",
      sources: [{ name: "source.bin", bytes: new Uint8Array([1, 2, 3]), mime: "application/octet-stream" }],
      outputs: [{ name: "result.txt", bytes: new TextEncoder().encode("hello"), mime: "text/plain;charset=utf-8" }],
      hardValidationPassed: true
    });
    expect(report.lossy).toBe(true);
    expect(report.level).toBe("verified-with-notes");
    expect(report.notes.some((note) => note.includes("extracted text only"))).toBe(true);
    expect(report.checks.some((check) => check.label === "Blocking validation" && check.outcome === "passed")).toBe(true);
    expect(report.checks.some((check) => check.label === "PDF structure" && check.outcome === "not-checked")).toBe(true);
  });

  it("makes rasterized compression consequences explicit", async () => {
    const report = await verifyOutputTrust({
      operationId: "compress-pdf",
      sources: [{ name: "source.bin", bytes: new Uint8Array([1]), mime: "application/octet-stream" }],
      outputs: [{ name: "output.bin", bytes: new Uint8Array([2]), mime: "application/octet-stream" }],
      rasterized: true,
      hardValidationPassed: true
    });
    expect(report.lossy).toBe(true);
    expect(report.notes.join(" ")).toContain("Selectable text");
    expect(report.notes.join(" ")).toContain("forms");
    expect(report.notes.join(" ")).toContain("links");
  });

  it("wires the shared trust surface into all primary P5 workflows", () => {
    expect(quickSource).toContain("<OutputTrustPanel");
    expect(editorSource).toContain("<OutputTrustPanel");
    expect(organizerSource).toContain("<OutputTrustPanel");
    expect(ocrSource).toContain("<OutputTrustPanel");
    expect(editorSource).toContain('operationId: "editor"');
    expect(organizerSource).toContain('operationId: "organizer"');
    expect(ocrSource).toContain('operationId: "ocr"');
  });

  it("keeps frozen persistent formats unchanged", () => {
    expect(databaseSource).toContain("DB_VERSION = 13");
    expect(releaseSource).toContain("DATABASE_SCHEMA_VERSION = 13");
    expect(releaseSource).toContain("PROJECT_PACKAGE_VERSION = 9");
    expect(databaseSource).not.toContain("outputTrust");
    expect(databaseSource).not.toContain("verificationReport");
  });
});
