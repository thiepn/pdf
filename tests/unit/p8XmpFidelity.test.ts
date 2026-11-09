import { describe, expect, it } from "vitest";
import * as mupdf from "mupdf";
import * as pdfjs from "pdfjs-dist";
// @ts-ignore Node-only test corpus input
import { readFileSync } from "node:fs";
// @ts-ignore Node-only PDF.js worker path
import { resolve } from "node:path";
// @ts-ignore Node-only PDF.js worker URL
import { pathToFileURL } from "node:url";
import { inspectPdfFidelityProfile, validatePdfFidelity } from "../../src/fidelity/pdfFidelityClient";

declare const Buffer: { from(value: string | Uint8Array, encoding?: string): Uint8Array & { toString(encoding: string): string } };

(Promise as any).try ??= (fn: (...args: any[]) => unknown, ...args: any[]) => Promise.resolve().then(() => fn(...args));
(Uint8Array as any).fromHex ??= (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));
(Uint8Array as any).fromBase64 ??= (value: string) => Uint8Array.from(Buffer.from(value, "base64"));
(Uint8Array.prototype as any).toHex ??= function () { return Buffer.from(this).toString("hex"); };
(Uint8Array.prototype as any).toBase64 ??= function () { return Buffer.from(this).toString("base64"); };
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs")).href;

const original = new Uint8Array(readFileSync("tests/corpus/generated/plain-text.pdf"));
const xmpPrefix = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:qa="https://thiepn.dev/qa/"><qa:provenance>';
const xmpSuffix = "</qa:provenance></rdf:Description></rdf:RDF></x:xmpmeta>";

function mutateDocument(source: Uint8Array, provenance: string | null): Uint8Array {
  const pdf = mupdf.Document.openDocument(source, "application/pdf").asPDF()!;
  try {
    const root = pdf.getTrailer().get("Root");
    if (provenance === null) root.delete("Metadata");
    else {
      const xml = xmpPrefix + provenance + xmpSuffix;
      const stream = pdf.addStream(xml, { Type: pdf.newName("Metadata"), Subtype: pdf.newName("XML") });
      root.put("Metadata", stream);
    }
    const bytes = pdf.saveToBuffer();
    try { return Uint8Array.from(bytes.asUint8Array()); } finally { bytes.destroy(); }
  } finally { pdf.destroy(); }
}
const source = mutateDocument(original, "Approved academic provenance");
const changed = mutateDocument(source, "UNAUTHORIZED provenance mutation");
const stripped = mutateDocument(source, null);
function clearAllMetadata(sourceBytes: Uint8Array): Uint8Array {
  const pdf = mupdf.Document.openDocument(sourceBytes, "application/pdf").asPDF()!;
  try {
    const info = pdf.getTrailer().get("Info");
    for (const key of ["Title", "Author", "Subject", "Keywords", "Creator"]) info?.delete(key);
    const buffer = pdf.saveToBuffer();
    try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
  } finally { pdf.destroy(); }
}
const cleared = clearAllMetadata(stripped);

describe("P8 XMP provenance preservation", () => {
  it("rejects changed XMP metadata on an explicitly affected page", async () => {
    const report = await validatePdfFidelity(source, changed, [1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/XMP|metadata/i);
  });
  it("rejects removed XMP metadata even when core Info dictionary is unchanged", async () => {
    const report = await validatePdfFidelity(source, stripped, [1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/XMP|metadata/i);
  });
  it("accepts unchanged XMP metadata as a positive control", async () => {
    const report = await validatePdfFidelity(source, source, [1]);
    expect(report.failures).toEqual([]);
  });
  it("permits explicitly authorized metadata clearing when XMP is removed", async () => {
    const report = await validatePdfFidelity(source, cleared, [1], undefined, undefined, {
      expectations: { coreMetadataMode: "cleared" }
    });
    expect(report.passed).toBe(true);
  });
});
