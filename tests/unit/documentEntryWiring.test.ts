import { describe, expect, it } from "vitest";
import workspaceSource from "../../src/workspace/UnifiedWorkspace.tsx?raw";
import recommendationSource from "../../src/product/DocumentEntryRecommendations.tsx?raw";
import entrySource from "../../src/product/documentEntry.ts?raw";
// @ts-expect-error Vitest runs in Node; the browser app tsconfig intentionally excludes Node built-in typings.
import { readFileSync } from "node:fs";

const workspaceCss = readFileSync("src/product/workspace.css", "utf8");

describe("P2 intelligent document entry wiring", () => {
  it("shows immediate manifest recommendations and refines them after a delayed local inspection", () => {
    expect(workspaceSource).toContain("setEntryEvidence(documentEntryEvidenceFromProject(project))");
    expect(workspaceSource).toContain("window.setTimeout(() =>");
    expect(workspaceSource).toContain("inspectDocumentEntry(project, controller.signal)");
    expect(workspaceSource).toContain("}, 650)");
  });

  it("keeps recommendation inspection optional instead of converting failures into workspace errors", () => {
    expect(workspaceSource).toContain("Recommendations are optional guidance.");
    expect(workspaceSource).not.toContain('setError("Recommendation');
  });

  it("reuses the same recommendations in document entry and the document-actions sheet without moving document chrome", () => {
    expect(workspaceSource).toContain('className="document-entry-overlay"');
    expect(workspaceSource).toContain("<DocumentEntryRecommendations recommendations={entryRecommendations}");
    expect(workspaceSource).toContain("<DocumentEntryRecommendations compact recommendations={entryRecommendations}");
    expect(workspaceSource.indexOf('className="document-entry-overlay"')).toBeGreaterThan(workspaceSource.indexOf('className={mode === "viewer" ? "workspace-mode-content workspace-mode-content--reader"'));
  });

  it("suppresses the floating recommendation overlay before tablet controls can be covered", () => {
    expect(workspaceCss).toContain("@media (max-width: 900px)");
    expect(workspaceCss).toMatch(/@media \(max-width: 900px\)[\s\S]*\.document-entry-overlay[\s\S]*display:\s*none/);
    expect(workspaceSource).toContain("<DocumentEntryRecommendations compact recommendations={entryRecommendations}");
  });

  it("avoids a full security-page walk for large ordinary PDFs", () => {
    expect(entrySource).toContain("const securityWorthInspecting = evidence.pageCount <= 60");
    expect(entrySource).toContain("|| evidence.formFieldCount > 0");
    expect(entrySource).toContain("|| evidence.attachmentCount > 0");
    expect(entrySource).toContain("securityWorthInspecting ? inspectSecurity");
  });

  it("states the local-only privacy boundary in the recommendation UI", () => {
    expect(recommendationSource).toContain("Nothing is uploaded and no AI model reads the document.");
    expect(entrySource).not.toContain("fetch(");
    expect(entrySource).not.toContain("XMLHttpRequest");
  });
});
