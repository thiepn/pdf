// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as mupdf from "mupdf";
import * as pdfjs from "pdfjs-dist";
// @ts-ignore Node-only test fixture reader
import { readFileSync } from "node:fs";
// @ts-ignore Node-only test path
import { resolve } from "node:path";
// @ts-ignore Node-only worker URL
import { pathToFileURL } from "node:url";
import { validatePdfFidelity } from "../../src/fidelity/pdfFidelityClient";
import { inspectRawLinkActionEvidence } from "../../src/fidelity/rawLinkActionEvidence";

declare const Buffer: { from(value: string | Uint8Array, encoding?: string): Uint8Array & { toString(encoding: string): string } };
(Promise as any).try ??= (fn: (...args: any[]) => unknown, ...args: any[]) => Promise.resolve().then(() => fn(...args));
(Uint8Array as any).fromHex ??= (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));
(Uint8Array as any).fromBase64 ??= (value: string) => Uint8Array.from(Buffer.from(value, "base64"));
(Uint8Array.prototype as any).toHex ??= function () { return Buffer.from(this).toString("hex"); };
(Uint8Array.prototype as any).toBase64 ??= function () { return Buffer.from(this).toString("base64"); };
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs")).href;

const input = new Uint8Array(readFileSync("tests/corpus/generated/plain-text.pdf"));
function alter(source: Uint8Array, operation: "add-next" | "change-next" | "add-AA" | "delete-next" | "script-next" | "clean-script" | "delete-AA"): Uint8Array {
  const pdf = mupdf.Document.openDocument(source, "application/pdf").asPDF()!;
  try {
    const page = pdf.loadPage(0) as mupdf.PDFPage;
    try {
      const link = page.getObject().get("Annots").get(0);
      const primary = link.get("A");
      if (operation === "add-next" || operation === "change-next") {
        const action = pdf.newDictionary();
        action.put("S", pdf.newName("URI"));
        action.put("URI", pdf.newString(operation === "add-next" ? "https://example.com/one" : "https://example.com/two"));
        primary.put("Next", action);
      } else if (operation === "script-next") {
        const action = pdf.newDictionary();
        action.put("S",pdf.newName("JavaScript"));
        action.put("JS",pdf.newString("app.alert('isolated test')"));
        primary.put("Next",action);
      } else if (operation === "clean-script") {
        const action = primary.get("Next");
        action.delete("S");
        action.delete("JS");
      } else if (operation === "delete-AA") {
        link.delete("AA");
      } else if (operation === "add-AA") {
        const action = pdf.newDictionary();
        action.put("S", pdf.newName("JavaScript"));
        action.put("JS", pdf.newString("app.alert('untrusted')"));
        const additional = pdf.newDictionary();
        additional.put("E", action);
        link.put("AA", additional);
      } else primary.delete("Next");
      page.update();
    } finally { page.destroy(); }
    const buffer = pdf.saveToBuffer();
    try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
  } finally { pdf.destroy(); }
}
const chained = alter(input, "add-next");
describe("P8 raw supplemental annotation action graphs", () => {
  it("rejects a newly chained /Next action omitted from PDF.js link data", async () => {
    const report = await validatePdfFidelity(input, chained, [1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/action/i);
  });
  it("rejects an altered /Next destination with identical main URL and link count", async () => {
    const report = await validatePdfFidelity(chained, alter(chained, "change-next"), [1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/action/i);
  });
  it("rejects newly attached /AA JavaScript without executing it", async () => {
    const report = await validatePdfFidelity(input, alter(input, "add-AA"), [1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/action/i);
  });
  it("rejects removal of an original chained action", async () => {
    const report = await validatePdfFidelity(chained, alter(chained,"delete-next"), [1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/action/i);
  });
  it("fails closed on excessive nested /Next action depth", () => {
    const pdf=mupdf.Document.openDocument(input,"application/pdf").asPDF()!;
    try {
      const page=pdf.loadPage(0) as mupdf.PDFPage;
      try {
        let action=page.getObject().get("Annots").get(0).get("A");
        for(let i=0;i<30;i++){
          const next=pdf.newDictionary();
          next.put("S",pdf.newName("URI"));
          next.put("URI",pdf.newString("https://example.org/bounded"));
          action.put("Next",next);
          action=next;
        }
        expect(()=>inspectRawLinkActionEvidence(pdf,[1])).toThrow(/safe inspection limits/i);
      }finally{page.destroy()}
    }finally{pdf.destroy()}
  });
  it("allows only the explicitly requested removal of embedded action scripts", async () => {
    const scripted=alter(input,"script-next");
    const cleaned=alter(scripted,"clean-script");
    const report=await validatePdfFidelity(scripted,cleaned,[1],undefined,undefined,{
      expectations:{expectedHasJavaScript:false,removeEmbeddedLinkScripts:true}
    });
    expect(report.failures).toEqual([]);
    const missed=await validatePdfFidelity(scripted,scripted,[1],undefined,undefined,{
      expectations:{expectedHasJavaScript:false,removeEmbeddedLinkScripts:true}
    });
    expect(missed.passed).toBe(false);
    expect(missed.failures.join(" ")).toMatch(/scripts were not removed|JavaScript presence/i);
  });
  it("allows explicit annotation /AA removal, but refuses the same change without authorization", async () => {
    const withActions=alter(input,"add-AA");
    const cleaned=alter(withActions,"delete-AA");
    const authorized=await validatePdfFidelity(withActions,cleaned,[1],undefined,undefined,{
      expectations:{removeLinkAdditionalActions:true}
    });
    expect(authorized.failures).toEqual([]);
    const unauthorized=await validatePdfFidelity(withActions,cleaned,[1]);
    expect(unauthorized.passed).toBe(false);
    expect(unauthorized.failures.join(" ")).toMatch(/action graph/i);
  });
  it("accepts byte-identical chained links", async () => {
    const report = await validatePdfFidelity(chained, chained, [1]);
    expect(report.failures).toEqual([]);
  });
  it("does not false-reject existing ordinary URI links", async () => {
    const report = await validatePdfFidelity(input, input, [1]);
    expect(report.failures).toEqual([]);
  });
  it("accepts a renamed destination pointing to the same page and view", async () => {
    const source=new Uint8Array(readFileSync("tests/corpus/p8-named-destination/source.pdf"));
    const alias=new Uint8Array(readFileSync("tests/corpus/p8-named-destination/alias.pdf"));
    const report=await validatePdfFidelity(source,alias,[1]);
    expect(report.failures).toEqual([]);
  });
  it("rejects named-destination retargeting without a change to the link annotation", async () => {
    const source=new Uint8Array(readFileSync("tests/corpus/p8-named-destination/source.pdf"));
    const retarget=new Uint8Array(readFileSync("tests/corpus/p8-named-destination/retarget.pdf"));
    const report=await validatePdfFidelity(source,retarget,[1]);
    expect(report.passed).toBe(false);
    expect(report.failures.join(" ")).toMatch(/link/i);
  });
});