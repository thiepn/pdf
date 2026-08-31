import { describe, expect, it } from "vitest";
import appSource from "../../src/App.tsx?raw";
import taskCatalogSource from "../../src/ia/taskCatalog.ts?raw";
import compressionSource from "../../src/views/CompressionPage.tsx?raw";
import ocrSource from "../../src/views/OcrPage.tsx?raw";
import secureSource from "../../src/views/SecurePage.tsx?raw";
import complianceSource from "../../src/views/CompliancePage.tsx?raw";
import batchSource from "../../src/views/BatchPage.tsx?raw";
import diagnosticsSource from "../../src/views/DiagnosticsPage.tsx?raw";
import systemDiagnosticsSource from "../../src/diagnostics/SystemDiagnostics.tsx?raw";
import performanceSource from "../../src/diagnostics/PerformanceDiagnostics.tsx?raw";

describe("P41 product-wide consumer language", () => {
  it("keeps everyday task and route language outcome-first", () => {
    expect(appSource).toContain('title: "Troubleshooting"');
    expect(taskCatalogSource).toContain('label: "Clean up PDF"');
    expect(taskCatalogSource).not.toContain('label: "Sanitize PDF"');
    expect(compressionSource).toContain("Choose how much to shrink the PDF");
    expect(compressionSource).not.toContain("Optimize or raster-compress");
    expect(batchSource).toContain('<aside className="batch-recipe"><h3>Workflow</h3>');
    expect(batchSource).not.toContain(">Export JSON</button>");
  });

  it("uses progressive disclosure for confidence, diagnostics, and validation detail", () => {
    expect(ocrSource).toContain("<summary>Recognition details</summary>");
    expect(diagnosticsSource).toContain("<summary>Technical diagnostics</summary>");
    expect(systemDiagnosticsSource).toContain("<summary>Technical browser details</summary>");
    expect(performanceSource).toContain("<summary>Technical performance measurements</summary>");
    expect(performanceSource).not.toContain("P0 local instrumentation");
    expect(secureSource).toContain("<summary>Check details</summary>");
    expect(secureSource).not.toContain("PDF.js and MuPDF reopening");
  });

  it("keeps specialist concepts available only after deliberate navigation", () => {
    expect(complianceSource).toContain('useState<Tab>("accessibility")');
    expect(complianceSource).toContain('archive: "Archive / PDF-A"');
    expect(diagnosticsSource).toContain('{ id: "viewer", label: "PDF.js" }');
    expect(diagnosticsSource).toContain('{ id: "engine", label: "MuPDF" }');
  });
});
