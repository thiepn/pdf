import { describe, expect, it } from "vitest";
import { classifyIssue, presentIssue } from "../../src/trust/issuePresentation";

describe("R7 issue presentation", () => {
  it("classifies cancellations without treating them as failures", () => {
    const error = new DOMException("Operation cancelled.", "AbortError");
    expect(classifyIssue(error)).toBe("cancelled");
    const issue = presentIssue(error, { action: "OCR", outputReleased: false });
    expect(issue.title).toBe("OCR was cancelled");
    expect(issue.outputReleased).toBe(false);
  });

  it("classifies local resource limits", () => {
    expect(classifyIssue(new Error("Not enough local storage headroom to save the resulting revision."))).toBe("resource-limitation");
  });

  it("classifies browser capability limits", () => {
    expect(classifyIssue(new Error("Service workers are unavailable in this browser."))).toBe("browser-limitation");
  });

  it("classifies document limitations", () => {
    expect(classifyIssue(new Error("Unsupported XFA document structure."))).toBe("document-limitation");
  });

  it("classifies correctable user requirements", () => {
    expect(classifyIssue(new Error("Enter an owner password before applying AES-256 protection."))).toBe("user-action");
  });

  it("keeps unexpected technical text out of the primary explanation", () => {
    const raw = "TypeError: Cannot read properties of undefined (reading 'xref')";
    const issue = presentIssue(new Error(raw), { action: "Export", outputReleased: false });
    expect(issue.category).toBe("product-defect");
    expect(issue.summary).not.toContain("TypeError");
    expect(issue.summary).not.toContain("xref");
    expect(issue.technicalDetails).toContain("xref");
    expect(issue.originalSafe).toBe(true);
    expect(issue.outputReleased).toBe(false);
  });
});
