import assert from "node:assert/strict";
import { analyzeSignatureByteRanges, signatureCoverageLabel } from "../../src/compliance/signatureAnalysis.ts";
import { buildPdfAXmp, parsePdfAClaim, pdfaIdentity } from "../../src/compliance/pdfa.ts";
import { validateSignerResult } from "../../src/compliance/signerBridge.ts";

function fixture(byteRange, extras = "") {
  const bytes = new Uint8Array(240).fill(0x20);
  const payload = `%PDF-1.7\n/ByteRange [${byteRange.join(" ")}] /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached ${extras}`;
  bytes.set(new TextEncoder().encode(payload).slice(0, bytes.length));
  return bytes;
}

const current = analyzeSignatureByteRanges(fixture([0, 40, 80, 160], "/Reason (Approved) /Location (Berlin)"));
assert.equal(current.length, 1);
assert.equal(current[0].status, "covers-current-file");
assert.equal(current[0].unsignedTailBytes, 0);
assert.equal(current[0].signatureGapBytes, 40);
assert.equal(current[0].subFilter, "ETSI.CAdES.detached");
assert.equal(current[0].reason, "Approved");
assert.match(signatureCoverageLabel(current[0]), /current file/i);

const prior = analyzeSignatureByteRanges(fixture([0, 40, 80, 120]));
assert.equal(prior[0].status, "covers-prior-revision");
assert.equal(prior[0].unsignedTailBytes, 40);
assert.match(signatureCoverageLabel(prior[0]), /prior revision/i);

const invalid = analyzeSignatureByteRanges(fixture([1, 40, 80, 160]));
assert.equal(invalid[0].status, "invalid-range");
assert.match(signatureCoverageLabel(invalid[0]), /Invalid/);

assert.deepEqual(pdfaIdentity("PDF/A-1b"), { part: "1", conformance: "B" });
assert.deepEqual(pdfaIdentity("PDF/A-2b"), { part: "2", conformance: "B" });
assert.deepEqual(pdfaIdentity("PDF/A-3b"), { part: "3", conformance: "B" });
assert.equal(pdfaIdentity("none"), null);

const xmp = buildPdfAXmp("PDF/A-2b", "R&D <Archive>", "de", new Date("2026-08-08T00:00:00.000Z"));
assert.match(xmp, /pdfaid:part="2"/);
assert.match(xmp, /pdfaid:conformance="B"/);
assert.match(xmp, /R&amp;D &lt;Archive&gt;/);
assert.deepEqual(parsePdfAClaim(xmp), { claimed: true, part: "2", conformance: "B", profile: "PDF/A-2b" });
assert.equal(parsePdfAClaim("<x:xmpmeta/> ").claimed, false);

const signedPdf = new TextEncoder().encode("%PDF-1.7\n% signed\n");
assert.doesNotThrow(() => validateSignerResult({ schemaVersion: 1, signedPdf, signerDescription: "test signer" }));
assert.throws(() => validateSignerResult({ schemaVersion: 1, signedPdf: new Uint8Array(12), signerDescription: "bad" }), /not a PDF/i);

console.log(JSON.stringify({ passed: true, checks: 21 }, null, 2));
