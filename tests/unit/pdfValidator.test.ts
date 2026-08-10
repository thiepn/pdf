import { describe, expect, it } from "vitest";
import { createMinimalPdf } from "../../src/fixtures/minimalPdf";
import { validatePdfBytes } from "../../src/validation/pdfValidator";

describe("validatePdfBytes", () => {
  it("accepts the generated Phase 0 fixture", () => {
    const result = validatePdfBytes(createMinimalPdf());
    expect(result.valid).toBe(true);
    expect(result.hasHeader).toBe(true);
    expect(result.hasEofMarker).toBe(true);
  });

  it("rejects empty data", () => {
    const result = validatePdfBytes(new Uint8Array());
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects a non-PDF payload", () => {
    const result = validatePdfBytes(new TextEncoder().encode("not a pdf"));
    expect(result.valid).toBe(false);
    expect(result.hasHeader).toBe(false);
  });
});
