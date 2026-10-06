import { describe, expect, it } from "vitest";
import compressionSource from "../../src/views/CompressionPage.tsx?raw";
import complianceSource from "../../src/views/CompliancePage.tsx?raw";
import preservationSource from "../../src/views/PreservationPage.tsx?raw";
import professionalSource from "../../src/views/ProfessionalPage.tsx?raw";

describe("derived output validity contracts", () => {
  it("blocks stale compression bytes and preview after profile or metadata changes", () => {
    expect(compressionSource).toContain("outputFingerprint === compressionFingerprint");
    expect(compressionSource).toContain("setOutputFingerprint(requestedFingerprint)");
    expect(compressionSource).toContain("function settingsChanged(): void {");
    expect(compressionSource).toContain("invalidateOutput();\n    setError(null);");
    expect(compressionSource).toContain('setProfile(item.id as ProfileId); settingsChanged();');
    expect(compressionSource).toContain("setRemoveMetadata(event.target.checked); settingsChanged();");
    expect(compressionSource).toContain("createDerivedProjectFromBytes(project.id, validatedOutput");
    expect(compressionSource).toContain("{validatedOutput ? <footer");
  });

  it("gates compliance download/save/evidence by the exact options and fields", () => {
    expect(complianceSource).toContain("resultFingerprint === complianceFingerprint");
    expect(complianceSource).toContain("setResultFingerprint(requestedFingerprint)");
    expect(complianceSource).toContain("validatedResult?.bytes ?? source");
    expect(complianceSource).toContain("setEvidence(null);");
    expect(complianceSource).toContain("createDerivedProjectFromBytes(project.id, validatedResult.bytes");
    expect(complianceSource).toContain("Compliance settings changed. Create the PDF again");
  });

  it("keeps optimize output valid but invalidates changed imposition output", () => {
    expect(preservationSource).toContain('resultFingerprint === "optimize"');
    expect(preservationSource).toContain('resultFingerprint === `impose:${impositionFingerprint}`');
    expect(preservationSource).toContain('requestedFingerprint = kind === "optimize" ? "optimize"');
    expect(preservationSource).toContain("const activeResult = validatedResult");
    expect(preservationSource).toContain("Print-layout settings changed. Create the vector print-layout copy again");
  });

  it("gates professional outputs by the exact operation inputs captured at run time", () => {
    expect(professionalSource).toContain("professionalImageIdentity");
    expect(professionalSource).toContain('`edits:${editsFingerprint}`');
    expect(professionalSource).toContain('`bates:${batesFingerprint}`');
    expect(professionalSource).toContain('`layers:${layersFingerprint}`');
    expect(professionalSource).toContain('`imposition:${impositionFingerprint}`');
    expect(professionalSource).toContain("setResultFingerprint(requestedFingerprint)");
    expect(professionalSource).toContain("if (!validatedResult || !project) return");
    expect(professionalSource).toContain("Professional settings changed. Create the output again");
  });
});
