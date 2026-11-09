// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as mupdf from "mupdf";
// @ts-ignore Node-only fixture reader
import { readFileSync } from "node:fs";
import { validatePdfFidelity } from "../../src/fidelity/pdfFidelityClient";
import * as pdfjs from "pdfjs-dist";
// @ts-ignore Node-only worker URL
import { resolve } from "node:path";
// @ts-ignore Node-only worker URL
import { pathToFileURL } from "node:url";
declare const Buffer: { from(value: string | Uint8Array, encoding?: string): Uint8Array & { toString(encoding: string): string } };
(Promise as any).try ??= (fn: (...args: any[]) => unknown, ...args: any[]) => Promise.resolve().then(() => fn(...args));
(Uint8Array as any).fromHex ??= (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));
(Uint8Array as any).fromBase64 ??= (value: string) => Uint8Array.from(Buffer.from(value, "base64"));
(Uint8Array.prototype as any).toHex ??= function () { return Buffer.from(this).toString("hex"); };
(Uint8Array.prototype as any).toBase64 ??= function () { return Buffer.from(this).toString("base64"); };
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs")).href;

const base = new Uint8Array(readFileSync("tests/corpus/generated/plain-text.pdf"));
function modify(source: Uint8Array, change: "annotate" | "drop-link" | "retarget-link" | "drop-comment" | "alter-comment" | "add-link" | "add-comment") {
  const pdf = mupdf.Document.openDocument(source, "application/pdf").asPDF()!;
  try {
    const page = pdf.loadPage(0) as mupdf.PDFPage;
    try {
      if (change === "annotate" || change === "add-comment") {
        const comment = page.createAnnotation("Text");
        comment.setRect(change === "annotate" ? [42, 78, 78, 107] : [82, 100, 111, 130]);
        comment.setContents(change === "annotate" ? "Preserve this review note" : "New authorized note");
        comment.update();
      }
      if (change === "drop-link") page.deleteLink(page.getLinks()[0]);
      if (change === "retarget-link") {
        const old = page.getLinks()[0];
        const bounds = old.getBounds();
        page.deleteLink(old);
        page.createLink(bounds, "https://example.org/unauthorized-change");
      }
      if (change === "drop-comment") page.deleteAnnotation(page.getAnnotations()[0]);
      if (change === "alter-comment") {const comment = page.getAnnotations()[0];comment.setContents("Changed without permission");comment.update();}
      if (change === "add-link") page.createLink([90, 195, 200, 222], "https://example.org/new-approved");
      page.update();
    } finally { page.destroy(); }
    const buf = pdf.saveToBuffer();
    try { return Uint8Array.from(buf.asUint8Array()); } finally { buf.destroy(); }
  } finally { pdf.destroy(); }
}
const withComment = modify(base,"annotate");
async function report(output: Uint8Array, expectations?: Record<string, unknown>) {
  return validatePdfFidelity(withComment,output,[1],undefined,undefined,{expectations});
}
describe("P8 affected-page link and annotation fidelity", () => {
  it("rejects silent existing link loss during an unrelated page edit", async () => {
    const result=await report(modify(withComment,"drop-link"));
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toMatch(/link/i);
  });
  it("rejects retargeting an original link even when the number of links stays fixed", async () => {
    const result=await report(modify(withComment,"retarget-link"));
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toMatch(/link/i);
  });
  it("rejects the loss of an existing comment", async () => {
    const result=await report(modify(withComment,"drop-comment"));
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toMatch(/annotation/i);
  });
  it("rejects changed comment content even when the annotation count stays constant", async () => {
    const result=await report(modify(withComment,"alter-comment"));
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toMatch(/annotation/i);
  });
  it("preserves existing link and comment as a control", async () => {
    const result=await report(withComment);
    expect(result.failures).toEqual([]);
  });
  it("permits a specifically authorized new link without deleting the original link", async () => {
    const result=await report(modify(withComment,"add-link"),{linkDeltaByPage:{1:1}});
    expect(result.failures).toEqual([]);
  });
  it("permits a specifically authorized new annotation without losing the original", async () => {
    const result=await report(modify(withComment,"add-comment"),{annotationDeltaByPage:{1:1}});
    expect(result.failures).toEqual([]);
  });
  it("permits explicit removal of links while leaving the original comment intact", async () => {
    const result=await report(modify(withComment,"drop-link"),{expectNoLinksOnAffectedPages:true});
    expect(result.failures).toEqual([]);
  });
  it("permits explicitly removing comments while retaining links", async () => {
    const result=await report(modify(withComment,"drop-comment"),{allowAnnotationRemovalOnAffectedPages:true});
    expect(result.failures).toEqual([]);
  });
});
