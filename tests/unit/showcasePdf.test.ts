import { describe, expect, it } from "vitest";
import { createShowcasePdf } from "../../src/fixtures/showcasePdf";
import { validatePdfBytes } from "../../src/validation/pdfValidator";

describe("createShowcasePdf", () => {
  it("creates a valid, searchable, feature-rich user sample", () => {
    const bytes = createShowcasePdf();
    const result = validatePdfBytes(bytes);
    const source = new TextDecoder().decode(bytes);
    expect(result.valid).toBe(true);
    expect(source).toContain("/Count 1");
    expect(source).toContain("(Launch Review)");
    expect(source).toContain("(Generated validation fixture - searchable text.)");
    expect(source).toContain("/Subtype /Image");
    expect(source).toContain("/Subtype /Form");
    expect(source).toContain("Workstream");
  });
});
