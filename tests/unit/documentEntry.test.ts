import { describe, expect, it } from "vitest";
import { recommendDocumentEntryTasks, type DocumentEntryEvidence } from "../../src/product/documentEntry";
import { getTask } from "../../src/ia/taskCatalog";

function evidence(overrides: Partial<DocumentEntryEvidence> = {}): DocumentEntryEvidence {
  return {
    pageCount: 8,
    byteLength: 4 * 1024 * 1024,
    encrypted: false,
    formFieldCount: 0,
    annotationCount: 0,
    attachmentCount: 0,
    hasJavaScript: false,
    metadataFieldCount: 0,
    warnings: [],
    sources: { manifest: true, structure: false, security: false },
    ...overrides
  };
}

describe("P2 intelligent document entry", () => {
  it("prioritizes OCR and compression for image-heavy scanned PDFs", () => {
    const recommendations = recommendDocumentEntryTasks(evidence({
      pageCount: 12,
      byteLength: 18 * 1024 * 1024,
      textCharacters: 40,
      imageOperations: 18,
      pagesWithText: 1,
      pagesWithImages: 12,
      likelyScanned: true,
      imageHeavy: true,
      sources: { manifest: true, structure: true, security: false }
    }));
    expect(recommendations[0]).toMatchObject({ taskId: "ocr-pdf", label: "Make this scan searchable" });
    expect(recommendations.map((item) => item.taskId)).toContain("compress-pdf");
  });

  it("does not call unverified manifest form widgets fillable before security inspection", () => {
    const recommendations = recommendDocumentEntryTasks(evidence({
      formFieldCount: 6,
      sources: { manifest: true, structure: false, security: false }
    }));
    expect(recommendations.map((item) => item.taskId)).not.toContain("fill-forms");
    expect(recommendations.map((item) => item.taskId)).toContain("flatten-pdf");
  });

  it("surfaces fill, signature and flatten workflows for interactive forms", () => {
    const recommendations = recommendDocumentEntryTasks(evidence({
      formFieldCount: 18,
      fillableFormFieldCount: 17,
      signatureFieldCount: 1,
      sources: { manifest: true, structure: true, security: true }
    }));
    expect(recommendations.map((item) => item.taskId)).toEqual(expect.arrayContaining(["fill-forms", "visual-signature", "flatten-pdf"]));
    expect(recommendations[0].taskId).toBe("fill-forms");
  });

  it("prioritizes compression and inspection for a very large PDF", () => {
    const recommendations = recommendDocumentEntryTasks(evidence({ byteLength: 143 * 1024 * 1024 }));
    expect(recommendations[0]).toMatchObject({ taskId: "compress-pdf", label: "Reduce file size" });
    expect(recommendations.map((item) => item.taskId)).toContain("document-details");
  });

  it("treats existing signatures as a preservation warning before editing", () => {
    const recommendations = recommendDocumentEntryTasks(evidence({
      signatureCount: 2,
      signedSignatureCount: 2,
      versionCount: 3,
      sources: { manifest: true, structure: false, security: true }
    }));
    expect(recommendations[0]).toMatchObject({ taskId: "document-details", label: "Review signatures" });
    const edit = recommendations.find((item) => item.taskId === "edit-pdf");
    expect(edit?.label).toBe("Edit a copy");
    expect(edit?.warning).toMatch(/signature/i);
  });

  it("prioritizes sanitization when active or embedded content is detected", () => {
    const recommendations = recommendDocumentEntryTasks(evidence({
      hasJavaScript: true,
      attachmentCount: 2,
      hasOpenAction: true,
      sources: { manifest: true, structure: false, security: true }
    }));
    expect(recommendations[0]).toMatchObject({ taskId: "sanitize-pdf", label: "Clean risky content" });
    expect(recommendations[0].evidence).toMatch(/JavaScript/);
  });

  it("prioritizes repair for PDFs that required structural recovery", () => {
    const recommendations = recommendDocumentEntryTasks(evidence({
      repaired: true,
      warnings: ["xref table repaired"],
      sources: { manifest: true, structure: false, security: true }
    }));
    expect(recommendations[0]).toMatchObject({ taskId: "repair-pdf", label: "Repair this PDF" });
  });

  it("keeps ordinary document entry useful instead of over-ranking metadata", () => {
    const recommendations = recommendDocumentEntryTasks(evidence({ metadataFieldCount: 5 }));
    expect(recommendations.map((item) => item.taskId)).toEqual(expect.arrayContaining(["edit-pdf", "read-pdf"]));
  });

  it("returns only real, unique tasks and keeps the recommendation set between two and four actions", () => {
    const recommendations = recommendDocumentEntryTasks(evidence({
      pageCount: 90,
      byteLength: 125 * 1024 * 1024,
      encrypted: true,
      formFieldCount: 8,
      fillableFormFieldCount: 7,
      signatureFieldCount: 1,
      attachmentCount: 3,
      hasJavaScript: true,
      signatureCount: 1,
      signedSignatureCount: 1,
      versionCount: 2,
      sources: { manifest: true, structure: true, security: true }
    }));
    expect(recommendations.length).toBeGreaterThanOrEqual(2);
    expect(recommendations.length).toBeLessThanOrEqual(4);
    expect(new Set(recommendations.map((item) => item.taskId)).size).toBe(recommendations.length);
    expect(recommendations.every((item) => Boolean(getTask(item.taskId)))).toBe(true);
  });
});
