// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as mupdf from "mupdf";
// @ts-ignore Node-only fixture reader
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist";
// @ts-ignore Node-only worker URL
import { resolve } from "node:path";
// @ts-ignore Node-only worker URL
import { pathToFileURL } from "node:url";
import { validatePdfFidelity } from "../../src/fidelity/pdfFidelityClient";

declare const Buffer: { from(value: string | Uint8Array, encoding?: string): Uint8Array & { toString(encoding: string): string } };
(Promise as any).try ??= (fn: (...args: any[]) => unknown, ...args: any[]) => Promise.resolve().then(() => fn(...args));
(Uint8Array as any).fromHex ??= (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));
(Uint8Array as any).fromBase64 ??= (value: string) => Uint8Array.from(Buffer.from(value, "base64"));
(Uint8Array.prototype as any).toHex ??= function () { return Buffer.from(this).toString("hex"); };
(Uint8Array.prototype as any).toBase64 ??= function () { return Buffer.from(this).toString("base64"); };
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs")).href;

const base = new Uint8Array(readFileSync("tests/corpus/generated/plain-text.pdf"));
function rewrite(bytes: Uint8Array, change: (pdf: mupdf.PDFDocument, page: mupdf.PDFPage) => void): Uint8Array {
  const pdf = mupdf.Document.openDocument(bytes, "application/pdf").asPDF()!;
  try {
    const page = pdf.loadPage(0) as mupdf.PDFPage;
    try {
      change(pdf, page);
      page.update();
    } finally { page.destroy(); }
    const buffer = pdf.saveToBuffer();
    try { return Uint8Array.from(buffer.asUint8Array()); } finally { buffer.destroy(); }
  } finally { pdf.destroy(); }
}
const hiddenSource = rewrite(base, (_pdf, page) => {
  const note = page.createAnnotation("Text");
  note.setRect([48, 95, 70, 122]);
  note.setContents("Private review finding: do not silently discard");
  note.setFlags(32); // ISO 32000 NoView flag; rendered in neither display intent nor print
  note.update();
});
const changed = (type: "drop" | "text" | "printflag") => rewrite(hiddenSource, (_pdf, page) => {
  const note = page.getAnnotations().find((item) => item.getType() === "Text");
  if (!note) throw new Error("Fixture missing the hidden Text annotation");
  if (type === "drop") page.deleteAnnotation(note);
  else if (type === "text") { note.setContents("Unauthorized replacement"); note.update(); }
  else { note.setFlags(36); note.update(); } // NoView + Print
});

describe("P8 non-display annotation integrity and internal link semantics", () => {
  it("rejects loss of a NoView review annotation on an affected page", async () => {
    const check = await validatePdfFidelity(hiddenSource, changed("drop"), [1]);
    expect(check.passed).toBe(false);
    expect(check.failures.join(" ")).toMatch(/annotation/i);
  });
  it("rejects silently changed NoView review content", async () => {
    const check = await validatePdfFidelity(hiddenSource, changed("text"), [1]);
    expect(check.passed).toBe(false);
    expect(check.failures.join(" ")).toMatch(/annotation/i);
  });
  it("rejects changed print visibility flags even when NoView stays set", async () => {
    const check = await validatePdfFidelity(hiddenSource, changed("printflag"), [1]);
    expect(check.passed).toBe(false);
    expect(check.failures.join(" ")).toMatch(/annotation/i);
  });
  it("accepts identical hidden annotations as a preservation control", async () => {
    const check = await validatePdfFidelity(hiddenSource, hiddenSource, [1]);
    expect(check.failures).toEqual([]);
  });
  it("permits explicit Secure removal of a hidden annotation", async () => {
    const check = await validatePdfFidelity(hiddenSource, changed("drop"), [1], undefined, undefined, {
      expectations: { allowAnnotationRemovalOnAffectedPages: true }
    });
    expect(check.failures).toEqual([]);
  });
  it("rejects altered internal page navigation while retaining link count", async () => {
    const source = rewrite(base, (pdf, page) => {
      const old = page.getLinks()[0]; const rect = old.getBounds();
      page.deleteLink(old);
      page.createLink(rect, pdf.formatLinkURI({ chapter: 0, page: 1, type: "Fit", x: 0, y: 0, width: 0, height: 0, zoom: 1 }));
    });
    const tampered = rewrite(source, (pdf, page) => {
      const old = page.getLinks()[0]; const rect = old.getBounds();
      page.deleteLink(old);
      page.createLink(rect, pdf.formatLinkURI({ chapter: 0, page: 2, type: "Fit", x: 0, y: 0, width: 0, height: 0, zoom: 1 }));
    });
    const check = await validatePdfFidelity(source, tampered, [1]);
    expect(check.passed).toBe(false);
    expect(check.failures.join(" ")).toMatch(/link/i);
  });

  it("accepts a genuine internal GoTo link whose target page is unchanged after indirect-object rebasing", async () => {
    const source = new Uint8Array(readFileSync("tests/corpus/p8-internal-rebase/source.pdf"));
    const output = new Uint8Array(readFileSync("tests/corpus/p8-internal-rebase/rewritten.pdf"));
    const getRawDestination = (bytes: Uint8Array): { raw: string; uri: string } => {
      const pdf = mupdf.Document.openDocument(bytes, "application/pdf").asPDF()!;
      try {
        const page = pdf.loadPage(0) as mupdf.PDFPage;
        try {
          const link = page.getObject().get("Annots").get(0);
          const destination = link.get("A").get("D").get(0);
          return { raw: String(destination), uri: page.getLinks()[0].getURI() };
        } finally { page.destroy(); }
      } finally { pdf.destroy(); }
    };
    const before = getRawDestination(source);
    const after = getRawDestination(output);
    expect(before.raw).not.toEqual(after.raw);
    expect(before.uri).toEqual(after.uri);
    const check = await validatePdfFidelity(source, output, [1]);
    expect(check.failures).toEqual([]);
  });
  it("rejects an internal GoTo action replaced with an external URI action", async () => {
    const source = new Uint8Array(readFileSync("tests/corpus/p8-internal-rebase/source.pdf"));
    const redirected = rewrite(source, (_pdf, page) => {
      const link = page.getLinks()[0];
      const rect = link.getBounds();
      page.deleteLink(link);
      page.createLink(rect, "https://example.org/unauthorized-action-replacement");
    });
    const check = await validatePdfFidelity(source, redirected, [1]);
    expect(check.passed).toBe(false);
    expect(check.failures.join(" ")).toMatch(/link/i);
  });
});
