import { describe, expect, it } from "vitest";
import { analyzeSignatureByteRanges } from "../../src/compliance/signatureAnalysis";
import { buildPdfAXmp, parsePdfAClaim } from "../../src/compliance/pdfa";
import { validateSignerResult } from "../../src/compliance/signerBridge";
import { bookletOrder, mmToPdfPoints } from "../../src/professional/imposition";

describe("Phase 19 compliance helpers", () => {
  it("distinguishes current-file and prior-revision signature coverage", () => {
    const current = new Uint8Array(200).fill(0x20);
    current.set(new TextEncoder().encode("%PDF-1.7\n/ByteRange [0 30 70 130] /SubFilter /ETSI.CAdES.detached"));
    expect(analyzeSignatureByteRanges(current)[0]).toMatchObject({ status: "covers-current-file", unsignedTailBytes: 0 });

    const prior = new Uint8Array(200).fill(0x20);
    prior.set(new TextEncoder().encode("%PDF-1.7\n/ByteRange [0 30 70 100]"));
    expect(analyzeSignatureByteRanges(prior)[0]).toMatchObject({ status: "covers-prior-revision", unsignedTailBytes: 30 });
  });

  it("creates and parses explicit PDF/A identification XMP", () => {
    const xmp = buildPdfAXmp("PDF/A-3b", "Archive", "en", new Date("2026-08-08T00:00:00Z"));
    expect(parsePdfAClaim(xmp)).toEqual({ claimed: true, part: "3", conformance: "B", profile: "PDF/A-3b" });
  });

  it("rejects non-PDF external signer responses", () => {
    expect(() => validateSignerResult({ schemaVersion: 1, signedPdf: new Uint8Array(10), signerDescription: "bad" })).toThrow(/PDF/);
  });

  it("supports metric print geometry and RTL booklet ordering", () => {
    expect(mmToPdfPoints(25.4)).toBeCloseTo(72, 5);
    expect(bookletOrder(6, "rtl")).toEqual([[1,null],[null,2],[3,6],[5,4]]);
  });
});
