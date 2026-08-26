import { describe, expect, it } from "vitest";
import pdfJsSource from "../../src/engines/pdfjs.ts?raw";
import projectRepositorySource from "../../src/projects/projectRepository.ts?raw";
import nativeClientSource from "../../src/native/nativeClient.ts?raw";

describe("Recovery P2 shared document session architecture", () => {
  it("keeps parsed PDF.js documents alive across short mode handoffs", () => {
    expect(pdfJsSource).toContain("sessionsByBytes");
    expect(pdfJsSource).toContain("SESSION_IDLE_MS");
    expect(pdfJsSource).toContain("pdfjs.session.hit");
    expect(pdfJsSource).toContain("releaseLease(entry)");
    expect(pdfJsSource).toContain("textCache");
    expect(pdfJsSource).toContain("geometryCache");
  });

  it("shares immutable project source bytes across OPFS and IndexedDB modes", () => {
    expect(projectRepositorySource).toContain("sourceSessions");
    expect(projectRepositorySource).toContain("projectBytes.session.hit");
    expect(projectRepositorySource).toContain("MAX_SOURCE_SESSIONS");
    expect(projectRepositorySource).toContain("await base.loadProjectBytes(project)");
  });

  it("reuses completed MuPDF inspection work when Edit is reopened", () => {
    expect(nativeClientSource).toContain("inspectionsByBytes");
    expect(nativeClientSource).toContain("mupdf.inspection.session.hit");
    expect(nativeClientSource).toContain("if (signal) return base.inspectNativePdf");
  });
});
