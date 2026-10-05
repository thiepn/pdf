import { describe, expect, it } from "vitest";
import editorSource from "../../src/views/EditorPage.tsx?raw";
import secureSource from "../../src/views/SecurePage.tsx?raw";
import fidelitySource from "../../src/fidelity/pdfFidelity.ts?raw";
import databaseSource from "../../src/storage/database.ts?raw";
import releaseSource from "../../src/core/release.ts?raw";

describe("P8 fidelity integration", () => {
  it("gates ordinary editor publication on fidelity validation", () => {
    expect(editorSource).toContain("validatePdfFidelity");
    expect(editorSource).toContain("P8 fidelity validation failed");
    expect(editorSource).toMatch(/const fidelity = await validatePdfFidelity[\s\S]*if \(saveProject\)[\s\S]*commitPreparedNativePdfWrite/);
  });

  it("gates P7 secure output and declares intentional structural expectations", () => {
    expect(secureSource).toContain("validatePdfFidelity");
    expect(secureSource).toContain("expectedFormFieldCount");
    expect(secureSource).toContain("expectedAttachmentCount");
    expect(secureSource).toContain("expectedEncrypted");
    expect(secureSource).toContain("coreMetadataMode");
    expect(secureSource).toContain("P8 fidelity validation failed");
  });

  it("keeps preservation strict by default and permits only explicit expectations", () => {
    expect(fidelitySource).toContain("PdfFidelityExpectations");
    expect(fidelitySource).toContain("allowWidgetChangesOnAffectedPages");
    expect(fidelitySource).toContain("allowJavaScriptRemoval");
    expect(fidelitySource).toContain("Untouched page");
  });

  it("keeps frozen persistent formats unchanged", () => {
    expect(databaseSource).toContain("DB_VERSION = 13");
    expect(releaseSource).toContain("DATABASE_SCHEMA_VERSION = 13");
    expect(releaseSource).toContain("PROJECT_PACKAGE_VERSION = 9");
  });
});
